import { describe, expect, it } from 'vitest';
import { screenTask } from './rules.ts';

const long = (s: string) => ({ title: s, description: s, requirements: '' });

describe('screenTask', () => {
  it('rejects text that is too short to analyze', () => {
    const r = screenTask({ title: 'Test task', description: '', requirements: '' });
    expect(r.status).toBe('reject');
    if (r.status === 'reject') expect(r.outputKind).toBe('other');
  });

  it('rejects media production tasks', () => {
    const r = screenTask(long('Make a 15 second cinematic that makes a stranger want to play our game.'));
    expect(r.status).toBe('reject');
    if (r.status === 'reject') expect(r.outputKind).toBe('media');
  });

  it('rejects tasks that name video models', () => {
    const r = screenTask(long('Use text-to-video tools to deliver the final result for the campaign.'));
    expect(r.status).toBe('reject');
  });

  it('marks social engagement tasks as human only', () => {
    const r = screenTask(long('Follow our Instagram account and like this post to earn the reward.'));
    expect(r.status).toBe('human_only');
    if (r.status === 'human_only') expect(r.outputKind).toBe('social_action');
  });

  it('marks wallet and key tasks as human only', () => {
    const r = screenTask(long('Connect your wallet and sign the transaction to complete this quest.'));
    expect(r.status).toBe('human_only');
    if (r.status === 'human_only') expect(r.outputKind).toBe('onchain_action');
  });

  it('reports on-chain over social when both apply', () => {
    const r = screenTask(long('Follow us on Twitter, then connect your wallet to claim the reward.'));
    expect(r.status).toBe('human_only');
    if (r.status === 'human_only') {
      expect(r.outputKind).toBe('onchain_action');
      expect(r.reasons).toHaveLength(2);
    }
  });

  it('does not block ordinary writing about social media', () => {
    const r = screenTask(long('Write an Instagram caption for a new coffee brand launch, 40 words.'));
    expect(r.status).toBe('pass');
  });

  it('does not treat "follow these instructions" as a social action', () => {
    const r = screenTask(long('Please follow these instructions carefully and write a short report on YouTube trends.'));
    expect(r.status).toBe('pass');
  });

  it('does not reject text tasks about a video', () => {
    const r = screenTask(long('Generate a summary of the video transcript provided below in 100 words.'));
    expect(r.status).toBe('pass');
  });

  it('passes an ordinary text task', () => {
    const r = screenTask(long('Write a 200-word product description for a stainless steel coffee mug.'));
    expect(r.status).toBe('pass');
  });
});
