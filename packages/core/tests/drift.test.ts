// drift detection tests — Day 2 per IMPLEMENTATION_PLAN.md
import { describe, it } from 'vitest';

describe('detectDrift', () => {
  it.todo('returns clean when nothing changed');
  it.todo('returns graph-ahead when only graph changed');
  it.todo('returns code-ahead when only code changed');
  it.todo('returns conflict when both changed');
  it.todo('position-only changes do not trigger conflict');
});
