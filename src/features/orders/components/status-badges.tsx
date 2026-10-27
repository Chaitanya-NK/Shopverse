import { Badge } from "@/components/ui/badge";
import {
  FULFILLMENT_LABELS,
  type FulfillmentStatus,
  ORDER_STATUS_LABELS,
  type OrderStatus,
  PAYMENT_STATUS_LABELS,
  type PaymentStatus,
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
} from "@/features/orders/schemas";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-secondary text-secondary-foreground",
  good: "bg-success text-success-foreground",
  warn: "bg-warning text-warning-foreground",
  bad: "bg-destructive/10 text-destructive",
  info: "bg-accent text-accent-foreground",
  muted: "bg-muted text-muted-foreground",
} as const;

type Tone = keyof typeof TONES;

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", TONES[tone])}>
      {children}
    </Badge>
  );
}

const ORDER_TONES: Record<OrderStatus, Tone> = {
  pending: "warn",
  confirmed: "info",
  completed: "good",
  cancelled: "muted",
};
const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  pending: "warn",
  authorized: "info",
  paid: "good",
  partially_refunded: "neutral",
  refunded: "muted",
  failed: "bad",
};
const FULFILLMENT_TONES: Record<FulfillmentStatus, Tone> = {
  unfulfilled: "neutral",
  partially_fulfilled: "info",
  fulfilled: "good",
  returned: "bad",
};
const SHIPMENT_TONES: Record<ShipmentStatus, Tone> = {
  pending: "neutral",
  packed: "neutral",
  picked_up: "info",
  in_transit: "info",
  out_for_delivery: "warn",
  delivered: "good",
  failed_attempt: "bad",
  returned_to_origin: "bad",
  cancelled: "muted",
};

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <Pill tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Pill>
);
export const PaymentBadge = ({ status }: { status: PaymentStatus }) => (
  <Pill tone={PAYMENT_TONES[status]}>{PAYMENT_STATUS_LABELS[status]}</Pill>
);
export const FulfillmentBadge = ({ status }: { status: FulfillmentStatus }) => (
  <Pill tone={FULFILLMENT_TONES[status]}>{FULFILLMENT_LABELS[status]}</Pill>
);
export const ShipmentStatusBadge = ({ status }: { status: ShipmentStatus }) => (
  <Pill tone={SHIPMENT_TONES[status]}>{SHIPMENT_STATUS_LABELS[status]}</Pill>
);
