import { calculateRiskScore } from '@/lib/risk-service';

describe('calculateRiskScore', () => {
  it('returns low risk for small values', () => {
    const result = calculateRiskScore({ assetValue: 1, findingSeverity: 1 });
    expect(result.score).toBe(1);
    expect(result.level).toBe('Low');
  });

  it('returns medium risk in medium range', () => {
    const result = calculateRiskScore({ assetValue: 5, findingSeverity: 5 });
    expect(result.score).toBe(25);
    expect(result.level).toBe('Medium');
  });

  it('returns high risk in high range', () => {
    const result = calculateRiskScore({ assetValue: 8, findingSeverity: 7 });
    expect(result.score).toBe(56);
    expect(result.level).toBe('High');
  });

  it('returns critical risk in critical range', () => {
    const result = calculateRiskScore({ assetValue: 10, findingSeverity: 10 });
    expect(result.score).toBe(100);
    expect(result.level).toBe('Critical');
  });
});
