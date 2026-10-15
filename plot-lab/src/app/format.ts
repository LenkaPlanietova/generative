export const metres = (mm: number) => (mm >= 1000 ? (mm / 1000).toFixed(1) + " m" : Math.round(mm) + " mm");
export const duration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
export const count = (n: number) => n.toLocaleString("en-US");
