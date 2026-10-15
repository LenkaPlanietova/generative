import { getAlgorithm, LIBRARY } from "../../algorithms/registry";
import { useGeneration } from "../../store/generation";
import { useSettings } from "../../store/settings";
import { Thumbnail } from "./Thumbnail";

export function Library() {
  const algorithmId = useSettings((s) => s.algorithmId), setAlgorithm = useSettings((s) => s.setAlgorithm);
  const thumbnails = useGeneration((s) => s.thumbnails);
  return (
    <nav aria-label="Generator library" className="min-h-0 overflow-y-auto border-r border-line bg-panel">
      {LIBRARY.map((cat) => (
        <div key={cat.category} className="border-b border-line pb-2">
          <h2 className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{cat.category}</h2>
          <ul>
            {cat.items.map((item) => {
              const algo = getAlgorithm(item.id), selected = item.id === algorithmId;
              if (!algo) {
                return (
                  <li key={item.id} className="flex items-center justify-between px-3 py-1 text-faint" title={`Arrives in phase ${item.phase}`}>
                    <span>{item.name}</span>
                    <span className="font-mono text-[10px]">P{item.phase}</span>
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => setAlgorithm(item.id)} aria-current={selected}
                    className={`flex w-full gap-2.5 px-3 py-2 text-left transition-colors ${selected ? "bg-accent/10" : "hover:bg-raised"}`}>
                    <Thumbnail geometry={thumbnails[item.id]} />
                    <span className="min-w-0">
                      <span className={`block font-medium ${selected ? "text-accent" : "text-fg"}`}>{algo.name}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{algo.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
