import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppConnectDto } from './dto/whatsapp-connect.dto';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async connect(user: AuthenticatedUser, dto: WhatsAppConnectDto) {
    const phoneNumber = dto.phoneNumber.trim();

    const existing = await this.prisma.notificationChannel.findFirst({
      where: { userId: user.id, type: NotificationType.WHATSAPP, value: phoneNumber },
    });

    const channel = existing
      ? await this.prisma.notificationChannel.update({
          where: { id: existing.id },
          data: { isActive: true },
        })
      : await this.prisma.notificationChannel.create({
          data: { userId: user.id, type: NotificationType.WHATSAPP, value: phoneNumber },
        });

    await this.prisma.notificationChannel.updateMany({
      where: {
        userId: user.id,
        type: NotificationType.WHATSAPP,
        isActive: true,
        NOT: { id: channel.id },
      },
      data: { isActive: false },
    });

    return { connected: true, phoneNumber };
  }

  async disconnect(user: AuthenticatedUser) {
    const result = await this.prisma.notificationChannel.updateMany({
      where: { userId: user.id, type: NotificationType.WHATSAPP, isActive: true },
      data: { isActive: false },
    });

    return { disconnected: result.count > 0 };
  }

  async sendToUser(userId: string, message: string): Promise<void> {
    const channels = await this.prisma.notificationChannel.findMany({
      where: { userId, type: NotificationType.WHATSAPP, isActive: true },
    });

    for (const channel of channels) {
      try {
        await this.sendWhatsAppMessage(channel.value, message);
      } catch (error) {
        this.logger.error(
          `WhatsApp send failed for channel ${channel.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  private async sendWhatsAppMessage(to: string, body: string): Promise<void> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_WHATSAPP_FROM');

    if (!accountSid || !authToken || !from) {
      this.logger.warn('Twilio WhatsApp not configured — skipping');
      return;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: `whatsapp:${from}`,
        To: `whatsapp:${to}`,
        Body: body.slice(0, 1600),
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Twilio error ${response.status}: ${await response.text()}`);
    }
  }
}
