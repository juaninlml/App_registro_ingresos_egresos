import type { SVGProps } from "react";

/** Iconos de la app: trazo de 1.75 px, puntas redondeadas, cuadrícula de 24 px. */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...p}>
      {children}
    </svg>
  );
}

export const IconResumen = (p: P) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.5" /></Svg>
);
export const IconTarjeta = (p: P) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6.5 15h3" /></Svg>
);
export const IconPlan = (p: P) => (
  <Svg {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8 2.75v3.5M16 2.75v3.5" /><path d="m8.5 14.5 2 2 4-4" /></Svg>
);
export const IconMovimientos = (p: P) => (
  <Svg {...p}><path d="M7 20V5M3.5 8.5 7 5l3.5 3.5M17 4v15M13.5 15.5 17 19l3.5-3.5" /></Svg>
);
export const IconCredito = (p: P) => (
  <Svg {...p}><path d="M3.5 9.5 12 4l8.5 5.5" /><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3.5 20h17" /></Svg>
);
export const IconAjustes = (p: P) => (
  <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>
);
export const IconSalir = (p: P) => (
  <Svg {...p}><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12h9" /></Svg>
);
export const IconMas = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconCerrar = (p: P) => (
  <Svg {...p}><path d="m6.5 6.5 11 11M17.5 6.5l-11 11" /></Svg>
);
export const IconAtras = (p: P) => (
  <Svg {...p}><path d="m14.5 6-6 6 6 6" /></Svg>
);
export const IconAdelante = (p: P) => (
  <Svg {...p}><path d="m9.5 6 6 6-6 6" /></Svg>
);
export const IconBorrar = (p: P) => (
  <Svg {...p}><path d="M4.5 7h15M9.5 7V4.75h5V7M6.5 7l.8 12.25h9.4L17.5 7M10.25 11v5M13.75 11v5" /></Svg>
);
/** Dinero que entra: flecha hacia abajo y a la izquierda. */
export const IconIngreso = (p: P) => (
  <Svg {...p}><path d="M17.5 6.5 6.5 17.5M6.5 9v8.5H15" /></Svg>
);
/** Dinero que sale: flecha hacia arriba y a la derecha. */
export const IconGasto = (p: P) => (
  <Svg {...p}><path d="M6.5 17.5l11-11M9 6.5h8.5V15" /></Svg>
);
/** Pago a una tarjeta: tarjeta con palomita. */
export const IconPagoTarjeta = (p: P) => (
  <Svg {...p}><path d="M21.5 11V7.5A2.5 2.5 0 0 0 19 5H5a2.5 2.5 0 0 0-2.5 2.5v9A2.5 2.5 0 0 0 5 19h7.5M2.5 9.5h19" /><path d="m15.5 17.5 2 2 4-4" /></Svg>
);
/** Libreta del kakeibo (cierre de mes). */
export const IconLibreta = (p: P) => (
  <Svg {...p}><rect x="5" y="3.5" width="14.5" height="17" rx="2" /><path d="M8.5 3.5v17M3.5 7.5h3M3.5 12h3M3.5 16.5h3M11.5 8h5M11.5 11.5h3.5" /></Svg>
);
/** Lupa (buscar). */
export const IconBuscar = (p: P) => (
  <Svg {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></Svg>
);
/** Dinero que pasa entre tus cuentas. */
export const IconTransferencia = (p: P) => (
  <Svg {...p}><path d="M4.5 8.5h14M15 5l3.5 3.5L15 12M19.5 15.5h-14M9 12l-3.5 3.5L9 19" /></Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
);
export const IconAlerta = (p: P) => (
  <Svg {...p}><path d="M12 4 2.75 19.5h18.5L12 4Z" /><path d="M12 10v4M12 17v.01" /></Svg>
);
export const IconDeshacer = (p: P) => (
  <Svg {...p}><path d="M9 14 4.5 9.5 9 5" /><path d="M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3" /></Svg>
);
