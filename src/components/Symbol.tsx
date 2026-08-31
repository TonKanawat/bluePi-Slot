import { symbolUrl, type SymbolRow } from '../lib/admin';

/** One symbol tile. The spec calls for 10% padding between the symbol and its lane,
 *  which is why the tile insets rather than filling the cell. */
export function SymbolTile({ symbol, dim }: { symbol?: SymbolRow; dim?: boolean }) {
  return (
    <div className="tile" data-dim={dim ? 'true' : undefined}>
      {symbol ? (
        <>
          <img src={symbolUrl(symbol.image_path)} alt={symbol.name} title={symbol.name} />
          {/* A wild substituting for a missing member is the single most common
              reason a win looks wrong, so it is marked on the board itself. */}
          {symbol.is_wild && <span className="tile-badge wild">WILD</span>}
          {symbol.is_scatter && (
            <span className="tile-badge scatter">+{symbol.scatter_free_spins}</span>
          )}
        </>
      ) : (
        <div className="tile-blank" aria-hidden="true" />
      )}
    </div>
  );
}
