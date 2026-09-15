"use client";
import { useFormState } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { addClientActivityAction } from "./actions";
import { ACTIVITY_LABELS } from "@/lib/validation/client-activity";
import { dateTimeInDouala, doualaInputToIso } from "@/lib/dates";
import {
  INITIAL_MUTATION_STATE,
  Field,
  FIELD_CLASS,
  FormFeedback,
  SubmitButton,
} from "@/components/admin/form-controls";
export function ClientActivityForm({ clientId }: { clientId: string }) {
  const [state, action] = useFormState(addClientActivityAction, INITIAL_MUTATION_STATE);
  const form = useRef<HTMLFormElement>(null);
  const [date, setDate] = useState(() => dateTimeInDouala(new Date()));
  useEffect(() => {
    if (state.success) {
      form.current?.reset();
      setDate(dateTimeInDouala(new Date()));
    }
  }, [state.success, state.submissionId]);
  return (
    <form ref={form} action={action} className="mt-4 space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="occurredAt" value={doualaInputToIso(date)} />
      <Field label="Type de suivi">
        <select className={FIELD_CLASS} name="kind">
          {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date et heure (Douala)">
        <input
          required
          type="datetime-local"
          className={FIELD_CLASS}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      <Field label="Observation ou suivi">
        <textarea
          required
          name="body"
          maxLength={4000}
          rows={3}
          className={FIELD_CLASS}
          placeholder="Conseils donnés, résultat d’une prestation, préférence exprimée…"
        />
      </Field>
      <p className="text-xs text-stone-500">
        Chaque entrée conserve sa date et son auteur. Pour corriger une observation, ajoutez une
        nouvelle entrée.
      </p>
      <FormFeedback state={state} />
      <SubmitButton>Ajouter au dossier</SubmitButton>
    </form>
  );
}
