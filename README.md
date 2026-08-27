# bluePi Slot

Server-authoritative slot engine on Supabase Postgres.

## Running the migrations

This sandbox cannot reach `supabase.co` (blocked by network policy), so run these
yourself in the Supabase SQL editor, in order:

1. `supabase/migrations/0001_core_schema.sql` — users, roles, wallets, ledger, symbols,
   combinations, paylines, payout ladder, settings.
2. `supabase/migrations/0002_seed_paylines.sql` — the 29 paylines recovered from the
   requirements doc, the 20-rung payout ladder, and default settings.
3. `supabase/migrations/0003_win_engine.sql` — `slot.draw_grid()` and
   `slot.evaluate_grid()`.

All three are idempotent; re-running is safe.

## Running the tests

Against a local Postgres 16 (not Supabase — the tests truncate the symbol tables):

    ./run_tests.sh            # all four suites, 100 assertions

24 assertions. Any failure raises and stops the run.

## Settings you may want to change

`slot.setting` holds the values still awaiting a decision:

| key | default | note |
|---|---|---|
| `max_wilds_per_line` | 2 | Corner is fixed at 1 by the spec; this covers the other 28 lines |
| `cap_final_multiplier` | false | whether a special bonus may push the result past x6 |
| `free_spins_per_round` | 10 | |
| `free_spin_rounds_max` | 3 | |
| `yellow_card_bets` | 5 | |

## Payout rate

Reel frequency is set per symbol via `slot.symbol.weight`. The scatter weight is by far
the most sensitive value in the system — see the review for the simulation.

## Tuning the payout rate

Reel frequency is `slot.symbol.weight` — a relative number, so what matters is the
ratio between symbols, not the absolute value.

With plain symbols at **weight 100**, the scatter's weight sets almost the entire
payout rate, because free spins supply most of what the game returns:

| Scatter weight | Spins that trigger | Total return per 100 staked | Weeks to a Gold Coin |
|---|---|---|---|
| 10 | 18% | 278% | ~3 |
| 6 | 12% | 193% | ~4 |
| 4 | 7.5% | 134% | ~6 |
| **3** | **5.8%** | **119%** | **~7**  ← chosen |
| 2 | 3.3% | 101% | ~8 |
| 1 | 2.3% | 97% | ~9 |

**So: give each scatter symbol a weight of about 3 for every 100 on a plain symbol.**

The "weeks" column assumes a player stakes their full weekly free-point grant
(3 × 200) and nothing more. Because bets come out of the free wallet first and
winnings only ever land in the Wallet, the Wallet is a pure accumulator for such a
player — which means the grant, not the payout rate, sets the floor on how fast
prizes arrive.

Re-run the simulation once the real symbols and combination groups are loaded; these
figures come from a stand-in set.

## Test suites

    ./run_tests.sh            # all four suites, 100 assertions

Run against a local Postgres 16, not Supabase: both truncate tables.
