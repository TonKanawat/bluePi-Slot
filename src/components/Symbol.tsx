import { SWATCH_FOR, SYMBOL_BY_ID } from '../game/placeholder';

/** One symbol tile. The spec calls for 10% padding between the symbol and its lane,
 *  which is why the tile insets rather than filling the cell. */
export function SymbolTile({ id, dim }: { id: string; dim?: boolean }) {
  const sym = SYMBOL_BY_ID.get(id);
  const bg = SWATCH_FOR[id] ?? 'var(--surface-2)';
  const special = sym?.isWild || sym?.isScatter;

  return (
    <div className="tile" data-dim={dim ? 'true' : undefined}>
      {sym?.imageUrl ? (
        <img src={sym.imageUrl} alt={sym.name} />
      ) : (
        <div className="tile-face" style={{ background: bg, color: special ? '#fff' : 'var(--ink)' }}>
          <span>{sym?.name ?? '?'}</span>
        </div>
      )}
    </div>
  );
}
