import { BET_OPTIONS, type Bet } from '../game/types';

interface Props {
  value: Bet;
  onChange: (bet: Bet) => void;
  disabled: boolean;
  affordable: number;   // total points available across both wallets
}

export function BetSelector({ value, onChange, disabled, affordable }: Props) {
  return (
    <div className="bets" role="radiogroup" aria-label="Bet amount">
      {BET_OPTIONS.map((bet) => {
        const tooHigh = bet > affordable;
        return (
          <button
            key={bet}
            type="button"
            role="radio"
            aria-checked={value === bet}
            className="bet"
            data-active={value === bet ? 'true' : undefined}
            disabled={disabled || tooHigh}
            title={tooHigh ? 'Not enough points for this bet' : undefined}
            onClick={() => onChange(bet)}
          >
            {bet}
          </button>
        );
      })}
    </div>
  );
}
