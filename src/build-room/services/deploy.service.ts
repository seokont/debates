import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type GithubUser = { login: string };
type GithubFileResponse = { sha?: string };
type RailwayProjectResponse = {
  data?: { projectCreate?: { id?: string } };
};

export type DeployResult = {
  githubUrl: string | null;
  railwayUrl: string | null;
  deployUrl: string;
};

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);
  private readonly githubApiBase = 'https://api.github.com';
  private readonly railwayApiBase = 'https://backboard.railway.app/graphql/v2';

  constructor(private readonly config: ConfigService) {}

  async deploy(options: {
    slug: string;
    title: string;
    thesis: string;
    mvpScope: string;
    stack: string[];
    techCode: string;
  }): Promise<DeployResult> {
    const githubToken = this.config.get<string>('GITHUB_TOKEN');

    if (!githubToken) {
      this.logger.warn('GITHUB_TOKEN not set — skipping auto-deploy');
      return { githubUrl: null, railwayUrl: null, deployUrl: '' };
    }

    try {
      const githubUrl = await this.createGithubRepo(githubToken, options);
      const railwayUrl = await this.deployToRailway(options.slug);
      return { githubUrl, railwayUrl, deployUrl: railwayUrl ?? githubUrl };
    } catch (error) {
      this.logger.error(
        `Deploy failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { githubUrl: null, railwayUrl: null, deployUrl: '' };
    }
  }

  // ── GitHub ─────────────────────────────────────────────────────────────────

  private async createGithubRepo(
    token: string,
    options: {
      slug: string;
      title: string;
      thesis: string;
      mvpScope: string;
      stack: string[];
      techCode: string;
    },
  ): Promise<string> {
    const user = await this.githubGet<GithubUser>(token, '/user');
    const repoName = `mind-arena-${options.slug}`.slice(0, 100);

    const createRes = await fetch(`${this.githubApiBase}/user/repos`, {
      method: 'POST',
      headers: this.githubHeaders(token),
      body: JSON.stringify({
        name: repoName,
        description: options.title.slice(0, 255),
        private: false,
        auto_init: false,
      }),
    });

    // 422 = repo already exists — continue
    if (!createRes.ok && createRes.status !== 422) {
      const detail = await createRes.text();
      throw new Error(`GitHub repo creation failed ${createRes.status}: ${detail}`);
    }

    const repoUrl = `https://github.com/${user.login}/${repoName}`;
    this.logger.log(`GitHub repo: ${repoUrl}`);

    const files = this.buildProjectFiles(options);
    for (const [path, content] of Object.entries(files)) {
      await this.pushFile(token, user.login, repoName, path, content);
    }

    return repoUrl;
  }

  private async pushFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    content: string,
  ): Promise<void> {
    const encoded = Buffer.from(content, 'utf8').toString('base64');

    const existsRes = await fetch(
      `${this.githubApiBase}/repos/${owner}/${repo}/contents/${path}`,
      { headers: this.githubHeaders(token) },
    );
    const sha = existsRes.ok
      ? ((await existsRes.json()) as GithubFileResponse).sha
      : undefined;

    const putRes = await fetch(
      `${this.githubApiBase}/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: this.githubHeaders(token),
        body: JSON.stringify({
          message: `feat: Mind Arena scaffold — ${path}`,
          content: encoded,
          ...(sha ? { sha } : {}),
        }),
      },
    );

    if (!putRes.ok) {
      const detail = await putRes.text();
      this.logger.warn(`Failed to push ${path}: ${putRes.status} ${detail}`);
    }
  }

  private async githubGet<T>(token: string, path: string): Promise<T> {
    const res = await fetch(`${this.githubApiBase}${path}`, {
      headers: this.githubHeaders(token),
    });
    if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private githubHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mind-Arena-Bot/1.0',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  // ── Railway ────────────────────────────────────────────────────────────────

  private async deployToRailway(slug: string): Promise<string | null> {
    const token = this.config.get<string>('RAILWAY_API_TOKEN');
    if (!token) return null;

    try {
      const res = await fetch(this.railwayApiBase, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation CreateProject($name: String!) {
              projectCreate(input: { name: $name }) {
                id
              }
            }
          `,
          variables: { name: `mind-arena-${slug}` },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as RailwayProjectResponse;
      const projectId = data.data?.projectCreate?.id;
      if (!projectId) return null;

      const railwayUrl = `https://railway.app/project/${projectId}`;
      this.logger.log(`Railway project created: ${railwayUrl}`);
      return railwayUrl;
    } catch {
      return null;
    }
  }

  // ── Project file scaffold ──────────────────────────────────────────────────

  private buildProjectFiles(options: {
    title: string;
    thesis: string;
    mvpScope: string;
    stack: string[];
    techCode: string;
  }): Record<string, string> {
    return {
      'README.md': this.buildReadme(options),
      'package.json': JSON.stringify(
        {
          name: options.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'mind-arena-project',
          version: '0.1.0',
          private: true,
          scripts: {
            start: 'node src/index.js',
            dev: 'node src/index.js',
          },
          dependencies: {},
        },
        null,
        2,
      ),
      'src/index.js': this.buildIndexJs(options),
      'railway.json': JSON.stringify(
        {
          $schema: 'https://railway.app/railway.schema.json',
          build: { builder: 'NIXPACKS' },
          deploy: {
            startCommand: 'node src/index.js',
            healthcheckPath: '/health',
          },
        },
        null,
        2,
      ),
    };
  }

  private buildReadme(options: {
    title: string;
    thesis: string;
    mvpScope: string;
    stack: string[];
  }): string {
    const lines = [
      `# ${options.title}`,
      '',
      '> Built by [Mind Arena](https://mindArena.app) — AI-powered venture organism.',
      '',
      '## Thesis',
      '',
      options.thesis,
      '',
      '## MVP Scope',
      '',
      options.mvpScope.slice(0, 1200),
      '',
    ];

    if (options.stack.length > 0) {
      lines.push('## Stack', '', options.stack.join(', '), '');
    }

    lines.push(
      '## Getting started',
      '',
      '```bash',
      'npm install',
      'npm start',
      '```',
    );

    return lines.join('\n');
  }

  private buildIndexJs(options: { title: string }): string {
    const safeTitle = options.title.replace(/["`]/g, "'").slice(0, 80);
    return [
      `// ${safeTitle}`,
      '// Scaffolded by Mind Arena — replace this with your actual implementation.',
      '',
      "const http = require('http');",
      '',
      'const server = http.createServer((req, res) => {',
      "  if (req.url === '/health') {",
      '    res.writeHead(200);',
      "    res.end('OK');",
      '    return;',
      '  }',
      "  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });",
      `  res.end('<h1>${safeTitle}</h1><p>MVP is being built.</p>');`,
      '});',
      '',
      'const PORT = process.env.PORT || 3000;',
      "server.listen(PORT, () => console.log(`Server running on port ${PORT}`));",
    ].join('\n');
  }
}
