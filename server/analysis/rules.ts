// Cheap, deterministic first screen for a task. No database, no AI.
// Rules only reject what is clearly out of reach; everything ambiguous passes to the AI analysis.
import type { OutputKind } from '../core/contracts.ts';

export interface ScreenInput {
  title: string;
  description?: string | null;
  requirements?: string | null;
}

export type ScreenOutcome =
  // The system cannot deliver this kind of work.
  | { status: 'reject'; outputKind: OutputKind; reasons: string[] }
  // Never automated: the user performs it (needs an account action or a private key).
  | { status: 'human_only'; outputKind: OutputKind; reasons: string[] }
  // No rule objects: the AI analysis decides.
  | { status: 'pass'; reasons: string[] };

const MIN_INFORMATIVE_LENGTH = 40;

// A production verb followed (within 3 words) by a clear media noun, or an explicit video-model hint.
const MEDIA_PRODUCTION =
  /\b(?:make|made|create|produce|generate|record|edit|design|shoot|film|animate|compose|render|draw|paint|build)\b(?:\W+\w+){0,3}?\W+(?:videos?|clips?|cinematics?|animations?|animated|logos?|illustrations?|posters?|voice-?overs?|podcasts?|songs?|music|3d)\b|\b(?:text|image)-to-video\b|\bvideo models?\b/i;

// Engagement actions on someone's social account. Always needs a social context word as well.
const SOCIAL_ACTIONS: RegExp[] = [
  /\bfollow(?:ing)?\s+(?:us|me|our|my|@\w+|the\s+(?:account|page|channel|profile)|on\s+(?:instagram|tiktok|youtube|twitter|x|facebook|telegram|discord))\b/i,
  /\bunfollow\b/i,
  /\bsubscribe\s+to\b/i,
  /\b(?:re-?tweet|re-?post|upvote|downvote)\b/i,
  /\blike\s+(?:and\s+(?:share|subscribe|comment)|&|\+|(?:this|the|our|my)\s+(?:posts?|videos?|tweets?|pages?|photos?)|\d+\s+(?:posts|videos|tweets|photos))\b/i,
  /\bcomment\s+(?:on|under)\b/i,
  /\bjoin\s+(?:our|the|my)\s+(?:telegram|discord|whatsapp|group|channel|server|community)\b/i,
  /\bshare\s+(?:this|the|our)\s+(?:post|video|tweet|link|page)\b/i,
];
const SOCIAL_CONTEXT =
  /\b(?:instagram|tiktok|youtube|twitter|x\.com|facebook|reddit|telegram|discord|whatsapp|tweet|reel|social media|channel|followers?)\b/i;

// Actions that need a wallet signature, a private key or moving funds.
const ONCHAIN_ACTIONS =
  /\b(?:connect\s+(?:your\s+)?wallet|sign\s+(?:a|the|this)\s+(?:transaction|message)|send\s+(?:a\s+)?transaction|(?:token|crypto)\s+swap|swap\s+(?:tokens?|eth|usdc|usdt)|bridge\s+(?:funds|tokens|usdc|eth)|(?:un)?stake\s+(?:your|the|\d)|mint\s+(?:an?|the|your)\s+nft|claim\s+(?:the\s+)?airdrop|deploy\s+(?:a|the|your)\s+(?:smart\s+)?contract|private\s+key|seed\s+phrase)\b/i;

export function screenTask(input: ScreenInput): ScreenOutcome {
  const text = [input.title, input.description ?? '', input.requirements ?? '']
    .join('\n')
    .trim();

  if (text.length < MIN_INFORMATIVE_LENGTH) {
    return {
      status: 'reject',
      outputKind: 'other',
      reasons: ['Task text is too short to analyze'],
    };
  }

  const humanReasons: string[] = [];
  let humanKind: OutputKind = 'other';

  if (ONCHAIN_ACTIONS.test(text)) {
    humanKind = 'onchain_action';
    humanReasons.push('Requires a wallet signature, private key or moving funds: never automated');
  }

  if (SOCIAL_CONTEXT.test(text) && SOCIAL_ACTIONS.some((rule) => rule.test(text))) {
    if (humanKind === 'other') humanKind = 'social_action';
    humanReasons.push('Requires engagement actions on a social account: never automated');
  }

  if (humanReasons.length > 0) {
    return { status: 'human_only', outputKind: humanKind, reasons: humanReasons };
  }

  if (MEDIA_PRODUCTION.test(text)) {
    return {
      status: 'reject',
      outputKind: 'media',
      reasons: ['Requires producing video, audio or design media, which is not supported yet'],
    };
  }

  return { status: 'pass', reasons: [] };
}
