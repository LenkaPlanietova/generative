export const metres = (mm: number) => (mm >= 1000 ? (mm / 1000).toFixed(1) + " m" : Math.round(mm) + " mm");
export const duration = (s: number) => {
  if (s < 59.5) return `${Math.round(s)} s`;
  const total = Math.round(s / 60), h = Math.floor(total / 60), m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
};
export const count = (n: number) => n.toLocaleString("en-US");
