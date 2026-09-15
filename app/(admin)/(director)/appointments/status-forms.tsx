"use client";

import { useFormState } from "react-dom";
import {
  FIELD_CLASS,
  FormFeedback,
  INITIAL_MUTATION_STATE,
  SubmitButton,
} from "@/components/admin/form-controls";
import {
  changeAppointmentStatusAction,
  completeAppointmentAction,
  recordAppointmentPaymentAction,
} from "./actions";

export function AppointmentStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useFormState(changeAppointmentStatusAction, INITIAL_MUTATION_STATE);
  const choices =
    status === "scheduled"
      ? ["confirmed", "arrived", "cancelled", "no_show"]
      : status === "confirmed"
        ? ["arrived", "cancelled", "no_show"]
        : status === "arrived"
          ? ["cancelled"]
          : [];
  if (!choices.length) return null;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <select className={FIELD_CLASS} name="status">
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {
              (
                {
                  confirmed: "Confirmer",
                  arrived: "Marquer arrivé",
                  cancelled: "Annuler",
                  no_show: "Marquer absent",
                } as Record<string, string>
              )[choice]
            }
          </option>
        ))}
      </select>
      <SubmitButton secondary>Mettre à jour le statut</SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}

export function AppointmentCheckoutForm({ id, balance }: { id: string; balance: number }) {
  const [state, action] = useFormState(completeAppointmentAction, INITIAL_MUTATION_STATE);
  return (
    <form action={action} className="space-y-3 rounded-xl bg-emerald-50 p-4">
      <input type="hidden" name="id" value={id} />
      <h2 className="font-black">Terminer la prestation</h2>
      <p className="text-sm">
        Solde à encaisser : <strong>{new Intl.NumberFormat("fr-FR").format(balance)} FCFA</strong>
      </p>
      {balance > 0 && (
        <select className={FIELD_CLASS} name="paymentMethod">
          <option value="cash">Espèces</option>
          <option value="orange_money">Orange Money</option>
          <option value="mtn_momo">MTN MoMo</option>
        </select>
      )}
      <SubmitButton>Enregistrer la visite</SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}

export function AppointmentPaymentForm({ id, balance }: { id: string; balance: number }) {
  const [state, action] = useFormState(recordAppointmentPaymentAction, INITIAL_MUTATION_STATE);
  if (balance <= 0) return null;
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-white p-5">
      <input type="hidden" name="id" value={id} />
      <h2 className="font-black">Enregistrer un acompte</h2>
      <p className="text-xs text-stone-500">
        Solde maximum : {new Intl.NumberFormat("fr-FR").format(balance)} FCFA
      </p>
      <input className={FIELD_CLASS} name="amount" type="number" min={1} max={balance} required />
      <select className={FIELD_CLASS} name="paymentMethod">
        <option value="cash">Espèces</option>
        <option value="orange_money">Orange Money</option>
        <option value="mtn_momo">MTN MoMo</option>
      </select>
      <SubmitButton secondary>Ajouter le paiement</SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}
