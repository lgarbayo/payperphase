import type { Dictionary } from "./types";

/**
 * Owned by WP-12. Impact visuals: the exposure meter and the "What if the clinic closes today?"
 * stress test. Every amount is a {{slot}} filled from engine props — never a literal number here.
 * Add keys to BOTH es and en (tests/i18n checks parity).
 */
export default {
  es: {
    title: "Impacto",

    // Exposure meter
    meterLabel: "Pagado por tratamiento aún no recibido",
    meterOkChip: "Nunca pagas por adelantado",
    meterAlertChip: "Pagado por adelantado",
    meterBreakdown: "Pagado {{paid}} · recibido {{delivered}} · pendiente {{remaining}}",
    meterLegendSettled: "Pagado y recibido",
    meterLegendPrepaid: "Pagado sin recibir",
    meterLegendFuture: "Fases pendientes",
    meterBarLabel: "Reparto del presupuesto por fase",
    meterSummary:
      "Pagado por tratamiento aún no recibido: {{prepaid}}. Has pagado {{paid}} y recibido tratamiento por {{delivered}}; quedan {{remaining}} por pagar en fases futuras.",
    meterPhaseSettled: "Fase {{n}}: {{amount}}, pagada y recibida",
    meterPhasePrepaid: "Fase {{n}}: {{amount}}, pagada pero aún no recibida",
    meterPhaseFuture: "Fase {{n}}: {{amount}}, pendiente",
    meterEmpty: "Aún no hay fases en este plan.",

    // Clinic-closure stress test
    closureButton: "¿Y si la clínica cierra hoy?",
    closureButtonHint: "Prueba de estrés ilustrativa",
    closureTitle: "¿Y si la clínica cierra hoy?",
    closureLine1:
      "Con un préstamo vinculado, la financiera paga todo el presupuesto el primer día. Si la clínica cierra, puedes dejar de pagar lo que no recibiste, pero te toca reclamarlo por escrito a la clínica y a la financiera, y si no responden, ir al Banco de España.",
    closureLine2: "Con PayPerPhase pagas cada fase el día que la recibes: no hay nada pagado por adelantado que perder.",
    closureIllustrativeBadge: "Ilustrativo",
    closureAsOf: "Fecha simulada · {{date}}",
    closureLoanLabel: "Préstamo vinculado",
    closureLoanLead: "Te toca reclamar",
    closureLoanTail: "por tratamiento que nunca recibiste",
    closureLoanDetail: "Financiado {{financed}} · {{months}} cuotas de {{monthly}}",
    closurePppLabel: "PayPerPhase",
    closurePppLead: "Te toca reclamar",
    closurePppTail: "nada: solo pagaste lo que ya recibiste",
    closurePppDetail: "Pagado {{paid}} · recibido {{delivered}}",
    closureUndeliveredTitle: "Fases que la clínica no llegaría a hacer",
    closureNoUndelivered: "Todas las fases ya están recibidas: no queda tratamiento pendiente.",
    closureContinuity:
      "Tu plan, las notas aprobadas por tu dentista y tus recibos siguen en este enlace: llévalos a otra clínica para terminar las fases pendientes.",
    closurePhase: "Fase {{n}}",
    closurePhaseWithTitle: "Fase {{n}} · {{title}}",
    closureNote: "Ilustrativo: préstamo de {{months}} meses al 0 % que financia todo el presupuesto.",
    closureSourcePrefix: "Fuente:",
    closureSource: "dsca.gob.es — preguntas frecuentes sobre tratamientos dentales financiados",
    closureSourceNewTab: "(se abre en una pestaña nueva)",
    closureClose: "Cerrar",
    closureCompareLabel: "Comparación: préstamo vinculado frente a PayPerPhase",
  },
  en: {
    title: "Impact",

    // Exposure meter
    meterLabel: "Paid for treatment not yet received",
    meterOkChip: "Never paid in advance",
    meterAlertChip: "Paid in advance",
    meterBreakdown: "Paid {{paid}} · received {{delivered}} · remaining {{remaining}}",
    meterLegendSettled: "Paid and received",
    meterLegendPrepaid: "Paid, not received",
    meterLegendFuture: "Upcoming phases",
    meterBarLabel: "Treatment plan split by phase",
    meterSummary:
      "Paid for treatment not yet received: {{prepaid}}. You have paid {{paid}} and received {{delivered}} of treatment; {{remaining}} is left to pay in future phases.",
    meterPhaseSettled: "Phase {{n}}: {{amount}}, paid and received",
    meterPhasePrepaid: "Phase {{n}}: {{amount}}, paid but not yet received",
    meterPhaseFuture: "Phase {{n}}: {{amount}}, upcoming",
    meterEmpty: "This plan has no phases yet.",

    // Clinic-closure stress test
    closureButton: "What if the clinic closes today?",
    closureButtonHint: "Illustrative stress test",
    closureTitle: "What if the clinic closes today?",
    closureLine1:
      "With a linked loan, the lender pays the whole quote on day one. If the clinic closes, you can stop paying for what you didn't receive, but it is on you to claim it in writing from the clinic and the lender and, if they don't answer, to go to the Bank of Spain.",
    closureLine2: "With PayPerPhase you pay each phase on the day you receive it: nothing is prepaid, so nothing is lost.",
    closureIllustrativeBadge: "Illustrative",
    closureAsOf: "Simulated date · {{date}}",
    closureLoanLabel: "Linked loan",
    closureLoanLead: "Yours to claim back",
    closureLoanTail: "for treatment you never received",
    closureLoanDetail: "Financed {{financed}} · {{months}} instalments of {{monthly}}",
    closurePppLabel: "PayPerPhase",
    closurePppLead: "Yours to claim back",
    closurePppTail: "nothing: you only paid for what you had already received",
    closurePppDetail: "Paid {{paid}} · received {{delivered}}",
    closureUndeliveredTitle: "Phases the clinic would never deliver",
    closureNoUndelivered: "Every phase has been received: no treatment is outstanding.",
    closureContinuity:
      "Your plan, the notes approved by your dentist and your receipts stay on this link: take them to another clinic to finish the remaining phases.",
    closurePhase: "Phase {{n}}",
    closurePhaseWithTitle: "Phase {{n}} · {{title}}",
    closureNote: "Illustrative: a {{months}}-month 0% loan financing the whole quote.",
    closureSourcePrefix: "Source:",
    closureSource: "dsca.gob.es — FAQ on financed dental treatment",
    closureSourceNewTab: "(opens in a new tab)",
    closureClose: "Close",
    closureCompareLabel: "Comparison: linked loan versus PayPerPhase",
  },
} as const satisfies Dictionary;
