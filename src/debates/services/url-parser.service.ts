import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../../debate-engine/services/agent.service';

@Injectable()
export class UrlParserService {
  private readonly logger = new Logger(UrlParserService.name);
  private readonly maxContentLength = 8000;

  constructor(private readonly agentService: AgentService) {}

  async extractThesis(url: string, userId?: string): Promise<string> {
    const content = await this.fetchPageContent(url);
    return this.extractThesisFromContent(content, url, userId);
  }

  private async fetchPageContent(url: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'MindArena/2.0 (debate-bot)' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BadRequestException(`Cannot fetch URL: ${url}`);
    }

    if (!response.ok) {
      throw new BadRequestException(`URL returned ${response.status}: ${url}`);
    }

    const text = await response.text();
    return this.stripHtml(text).slice(0, this.maxContentLength);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private async extractThesisFromContent(
    content: string,
    url: string,
    userId?: string,
  ): Promise<string> {
    const prompt = [
      'Extract the main debatable thesis from this web page content.',
      `URL: ${url}`,
      '',
      'PAGE CONTENT (truncated):',
      content,
      '',
      'Return ONLY the thesis — one clear, specific, arguable statement (1-3 sentences).',
      'The thesis must be falsifiable and worth debating.',
      'Do not add explanation or context. Return only the thesis itself.',
    ].join('\n');

    const thesis = await this.agentService.callProvider('anthropic', prompt, userId);
    const cleaned = thesis.trim().replace(/^["']|["']$/g, '');

    if (!cleaned || cleaned.length < 10) {
      throw new BadRequestException('Could not extract a valid thesis from this URL');
    }

    return cleaned.slice(0, 500);
  }
}
