import { Injectable } from '@nestjs/common';

export type DetectedMode = 'VERIFY' | 'EXPLORE' | 'QUANTUM' | 'ASK_USER';

export type ModeDetectionResult = {
  mode: DetectedMode;
  confidence: number;
  reason: string;
  exploreType?: 'STARTUPS' | 'SCIENCE' | 'SOLUTIONS' | 'ANOMALY';
};

@Injectable()
export class ModeDetectionService {
  detect(thesis: string): ModeDetectionResult {
    const normalized = thesis.trim().toLowerCase();
    const words = normalized.split(/\s+/);

    const verifyScore = this.scoreVerify(normalized, words);
    const exploreScore = this.scoreExplore(normalized, words);

    if (verifyScore > 0.6 && verifyScore > exploreScore) {
      return {
        mode: 'VERIFY',
        confidence: verifyScore,
        reason: 'Конкретное утверждение с глаголом или числом',
      };
    }

    if (exploreScore > 0.6) {
      return {
        mode: words.length < 5 && !this.hasVerb(normalized) ? 'QUANTUM' : 'EXPLORE',
        confidence: exploreScore,
        reason: 'Открытый вопрос или область без конкретного тезиса',
        exploreType: this.detectExploreType(normalized),
      };
    }

    return {
      mode: 'ASK_USER',
      confidence: Math.max(verifyScore, exploreScore),
      reason: 'Пограничный случай — нужен выбор пользователя',
    };
  }

  private scoreVerify(text: string, words: string[]): number {
    let score = 0;

    const verifyVerbs = [
      'заменит', 'безопасен', 'эффективнее', 'приведёт', 'доказано', 'лучше',
      'хуже', 'будет', 'является', 'replace', 'will', 'safer', 'better',
      'proven', 'causes', 'reduces', 'increases', 'is', 'are',
    ];
    if (verifyVerbs.some((v) => text.includes(v))) score += 0.4;

    if (/\d/.test(text)) score += 0.3;
    if (/\d{4}|\d+%|в \d+ раз|за \d+ лет/.test(text)) score += 0.2;

    if (words.length > 5 && words.length < 30) score += 0.1;

    return Math.min(score, 1);
  }

  private scoreExplore(text: string, words: string[]): number {
    let score = 0;

    const openWords = [
      'как', 'почему', 'что если', 'каким образом', 'варианты', 'механизмы',
      'объяснения', 'идеи', 'пути', 'why', 'how', 'what if', 'ideas',
      'mechanisms', 'options', 'approaches', 'explain', 'reasons',
    ];
    if (openWords.some((w) => text.includes(w))) score += 0.4;

    const domains = [
      'longevity', 'cancer', 'ai', 'climate', 'биология', 'медицина',
      'стартап', 'инновации', 'онкология', 'нейро',
    ];
    if (domains.some((d) => text.includes(d)) && words.length < 5) score += 0.4;

    const genWords = ['идеи', 'варианты', 'решения', 'подходы', 'ideas', 'options', 'solutions'];
    if (genWords.some((w) => text.includes(w))) score += 0.3;

    if (text.includes('почему') && !text.includes('почему не')) score += 0.2;

    return Math.min(score, 1);
  }

  private hasVerb(text: string): boolean {
    const verbs = ['is', 'are', 'will', 'can', 'does', 'has', 'был', 'будет', 'является'];
    return verbs.some((v) => text.includes(v));
  }

  private detectExploreType(
    text: string,
  ): 'STARTUPS' | 'SCIENCE' | 'SOLUTIONS' | 'ANOMALY' {
    if (/стартап|идеи|идей|startup|idea/.test(text)) return 'STARTUPS';
    if (/механизм|почему|why|mechanism|hypothesis/.test(text)) return 'SCIENCE';
    if (/как снизить|как решить|how to|решение|solution/.test(text)) return 'SOLUTIONS';
    if (/аномал|парадокс|anomaly|paradox|почему.*работает/.test(text)) return 'ANOMALY';
    return 'STARTUPS';
  }
}
