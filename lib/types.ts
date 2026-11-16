// Fechas siempre como texto ISO "YYYY-MM-DD" (sin zona horaria) para evitar desfases.
export type ISODate = string;

export interface Statement {
  fechaCorte: ISODate;
  fechaLimite: ISODate;
  saldoTotal: number; // deuda total de la tarjeta al corte (capital MSI + compras + cargos)
  pagoNoIntereses: number; // "pago para no generar intereses"
  pagoMinimo?: number;
}

export interface Card {
  id: string;
  banco: string;
  nombre: string;
  terminacion?: string; // últimos 4 dígitos (nunca guardes el número completo)
  limite?: number;
  diaCorte: number;
  statements: Statement[];
  notas?: string;
}

/** Cargo diferido a meses sin intereses. El calendario se deriva de `primerCorte`. */
export interface Msi {
  id: string;
  cardId: string;
  descripcion: string;
  fechaOperacion: ISODate;
  montoOriginal: number;
  pagoMensual: number;
  totalPagos: number;
  /** Corte del estado de cuenta en el que aparece el pago 1. */
  primerCorte: ISODate;
  terminacionTarjeta?: string; // tarjeta (titular/adicional) con que se hizo el cargo
}

export interface Loan {
  id: string;
  nombre: string;
  banco: string;
  montoOriginal: number;
  tasaAnual: number; // % anual nominal, ej. 38.5
  plazoMeses: number;
  primerPago: ISODate;
  pagoMensual?: number; // si lo dejas vacío se calcula
  ivaPct?: number; // 16 si el banco cobra IVA sobre los intereses
  pagosHechos: number;
  notas?: string;
}

export interface Payment {
  id: string;
  fecha: ISODate;
  monto: number;
  destino: "card" | "loan";
  targetId: string;
  nota?: string;
}

export interface Transaction {
  id: string;
  fecha: ISODate;
  tipo: "ingreso" | "gasto";
  monto: number;
  categoria: string;
  nota?: string;
  metodo?: string; // "efectivo/débito" o id de tarjeta
}

export interface PlanConfig {
  cardId: string;
  inicio: ISODate; // lunes en que empieza el plan (después del último corte)
  semanal: { desde: ISODate; monto: number }[]; // monto base que aplica desde esa fecha
  extras: { fecha: ISODate; monto: number; nota?: string }[]; // abonos únicos adicionales
  comprasEstimadas: number; // compras regulares estimadas por corte (después del primero)
}

export interface Settings {
  categoriasGasto: string[];
  categoriasIngreso: string[];
}

export interface DB {
  cards: Card[];
  msi: Msi[];
  loans: Loan[];
  payments: Payment[];
  plan: PlanConfig | null;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  categoriasGasto: [
    "Renta",
    "Transporte",
    "Comida (despensa)",
    "Comidas fuera",
    "Comida gatos",
    "Arena para gatos",
    "Gimnasio",
    "Suscripciones",
    "Servicios",
    "Salud",
    "Otros",
  ],
  categoriasIngreso: ["Sueldo", "Freelance", "Otros"],
};

export const EMPTY_DB: DB = {
  cards: [],
  msi: [],
  loans: [],
  payments: [],
  plan: null,
  settings: DEFAULT_SETTINGS,
};

export const DB_KEYS = ["cards", "msi", "loans", "payments", "plan", "settings"] as const;
export type DBKey = (typeof DB_KEYS)[number];
