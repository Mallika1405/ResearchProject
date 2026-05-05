interface Props {
  matrix?: number[][];   // v2 shape
  pearson?: number[][];  // v3 shape
  spearman?: number[][];
  pvalues: number[][];
  labels: string[];
}

const colorFor = (r: number) => {
  const intensity = Math.abs(r);
  if (r >= 0) return `hsl(150 100% ${15 + intensity * 40}% / ${0.2 + intensity * 0.8})`;
  return `hsl(0 90% ${15 + intensity * 40}% / ${0.2 + intensity * 0.8})`;
};

export const CorrelationHeatmap = ({ matrix, pearson, pvalues, labels }: Props) => {
  // v3 backend returns `pearson`, v2 returned `matrix` — handle both
  const data = pearson ?? matrix;

  if (!data || !labels || !pvalues) return (
    <div className="text-xs text-muted-foreground p-2">no correlation data</div>
  );

  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-0 text-[10px]">
        <thead>
          <tr>
            <th />
            {labels.map((l) => (
              <th
                key={l}
                className="px-1 pb-1 text-left text-muted-foreground"
                style={{ minWidth: 40 }}
              >
                <div className="origin-bottom-left -rotate-45 whitespace-nowrap">{l}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              <td className="pr-2 text-right text-muted-foreground">{labels[i]}</td>
              {row.map((v, j) => {
                const p = pvalues[i]?.[j];
                const sig = p !== null && p < 0.05 && i !== j;
                return (
                  <td
                    key={j}
                    title={`r=${v?.toFixed(3)}  p=${p?.toFixed(4)}`}
                    className="border border-border/30 text-center"
                    style={{
                      backgroundColor: v != null ? colorFor(v) : "transparent",
                      width: 40,
                      height: 28,
                      color: Math.abs(v ?? 0) > 0.5 ? "hsl(220 30% 5%)" : "hsl(150 30% 90%)",
                      fontWeight: sig ? 700 : 400,
                    }}
                  >
                    {v?.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] text-muted-foreground">
        bold = p &lt; 0.05 · green = positive · red = negative
      </div>
    </div>
  );
};