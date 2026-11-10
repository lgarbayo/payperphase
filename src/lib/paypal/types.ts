/** OWNED BY WP-04. The slices of PayPal REST payloads we read (Orders v2, Webhooks, Invoicing v2). */

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export type PayPalCaptureStatus =
  | "COMPLETED"
  | "PENDING"
  | "DECLINED"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface PayPalCapture {
  id: string;
  status: PayPalCaptureStatus;
  amount?: PayPalMoney;
  custom_id?: string;
  invoice_id?: string;
  create_time?: string;
  update_time?: string;
  status_details?: { reason?: string };
  supplementary_data?: { related_ids?: { order_id?: string } };
}

export type PayPalOrderStatus = "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";

export interface PayPalPurchaseUnit {
  reference_id?: string;
  custom_id?: string;
  invoice_id?: string;
  description?: string;
  amount?: PayPalMoney;
  payments?: { captures?: PayPalCapture[] };
}

export interface PayPalOrder {
  id: string;
  status: PayPalOrderStatus;
  intent?: "CAPTURE" | "AUTHORIZE";
  purchase_units?: PayPalPurchaseUnit[];
}

/** Body of POST /v2/checkout/orders as we send it. */
export interface CreateOrderBody {
  intent: "CAPTURE";
  purchase_units: Array<{
    reference_id: string;
    description: string;
    custom_id: string;
    invoice_id: string;
    amount: PayPalMoney;
  }>;
  application_context: {
    brand_name: string;
    locale: string;
    shipping_preference: "NO_SHIPPING";
    user_action: "PAY_NOW";
    return_url: string;
    cancel_url: string;
  };
}

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  create_time?: string;
  resource_type?: string;
  resource?: Record<string, unknown>;
}

export interface PayPalInvoice {
  id: string;
  status: string;
  detail?: { invoice_number?: string };
  amount?: PayPalMoney;
  payments?: {
    paid_amount?: PayPalMoney;
    transactions?: Array<{ payment_id?: string; payment_date?: string; amount?: PayPalMoney }>;
  };
}
