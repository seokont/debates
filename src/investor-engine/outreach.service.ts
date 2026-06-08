import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(private readonly config: ConfigService) {}

  async sendOutreachEmail(opts: {
    to: string;
    investorName: string;
    projectTitle: string;
    debateUrl: string;
    mvpUrl?: string;
    matchReason: string;
  }): Promise<void> {
    const resendKey = this.config.get<string>('RESEND_API_KEY');
    const fromEmail = this.config.get<string>('OUTREACH_FROM_EMAIL') ?? 'ai@mindarena.app';

    if (!resendKey) {
      this.logger.warn('RESEND_API_KEY not configured — skipping outreach email');
      return;
    }

    const subject = `${opts.projectTitle} — project from a debate you might find relevant`;
    const text = this.buildEmailBody(opts);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: opts.to, subject, text }),
    });

    if (!response.ok) {
      throw new Error(`Resend error ${response.status}: ${await response.text()}`);
    }
  }

  private buildEmailBody(opts: {
    investorName: string;
    projectTitle: string;
    debateUrl: string;
    mvpUrl?: string;
    matchReason: string;
  }): string {
    return [
      `This is an automated message from Mind Arena AI system.`,
      ``,
      `A project has been built from a debate that matches your investment focus.`,
      ``,
      `PROJECT: ${opts.projectTitle}`,
      `WHY THIS MATCHES: ${opts.matchReason}`,
      ``,
      `Debate analysis: ${opts.debateUrl}`,
      ...(opts.mvpUrl ? [`Live MVP: ${opts.mvpUrl}`, ''] : ['']),
      `If you're interested, reply to this email or contact the founder directly.`,
      ``,
      `Mind Arena AI System`,
      `(This message was sent by AI and is clearly labeled as such. The founder is a human.)`,
    ].join('\n');
  }
}
