"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DISCOVERY_LABELS } from "@/lib/clients/discovery";
import { useFormState } from "react-dom";
import {
  Field,
  FIELD_CLASS,
  FormFeedback,
  INITIAL_MUTATION_STATE,
  SubmitButton,
} from "@/components/admin/form-controls";
import { saveClientAction, changeClientStatusAction } from "./actions";

type ClientFields = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  sex: string | null;
  notes: string | null;
  preferences: string | null;
  allergies: string | null;
  city: string | null;
  neighbourhood: string | null;
  addressDetails: string | null;
  discoverySource: string;
  discoveryDetails: string | null;
  referredByClientId: string | null;
  referrerName: string | null;
};

export function ClientForm({
  client,
  referrers = [],
}: {
  client?: ClientFields;
  referrers?: { id: string; name: string; phone: string | null; email: string | null }[];
}) {
  const [source, setSource] = useState(client?.discoverySource ?? "unknown");
  const [referrerId, setReferrerId] = useState(client?.referredByClientId ?? "");
  const [state, action] = useFormState(saveClientAction, INITIAL_MUTATION_STATE);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success && !client) {
      form.current?.reset();
      setSource("unknown");
      setReferrerId("");
    }
  }, [state.success, state.submissionId, client]);
  return (
    <form ref={form} action={action} className="space-y-4">
      {client && <input type="hidden" name="id" value={client.id} />}
      <p className="text-sm text-stone-600">
        Les doublons sont vérifiés sur le nom, le téléphone, l’e-mail et le sexe ensemble. Pour un
        homonyme, renseignez ce qui distingue les deux personnes.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du client">
          <input
            className={FIELD_CLASS}
            name="name"
            required
            maxLength={120}
            defaultValue={client?.name}
            autoComplete="name"
          />
        </Field>
        <Field label="Téléphone (optionnel)">
          <input
            className={FIELD_CLASS}
            name="phone"
            type="tel"
            maxLength={30}
            defaultValue={client?.phone ?? ""}
            autoComplete="tel"
          />
        </Field>
        <Field label="E-mail (optionnel)">
          <input
            className={FIELD_CLASS}
            name="email"
            type="email"
            maxLength={254}
            defaultValue={client?.email ?? ""}
            autoComplete="email"
          />
        </Field>
        <Field label="Sexe (optionnel)">
          <select className={FIELD_CLASS} name="sex" defaultValue={client?.sex ?? ""}>
            <option value="">Non renseigné</option>
            <option value="femme">Femme</option>
            <option value="homme">Homme</option>
          </select>
        </Field>
      </div>
      <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4">
        <legend className="px-2 font-bold">Adresse</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ville">
            <input
              name="city"
              maxLength={120}
              defaultValue={client?.city ?? ""}
              className={FIELD_CLASS}
              autoComplete="address-level2"
            />
          </Field>
          <Field label="Quartier">
            <input
              name="neighbourhood"
              maxLength={120}
              defaultValue={client?.neighbourhood ?? ""}
              className={FIELD_CLASS}
            />
          </Field>
        </div>
        <Field label="Adresse et indications complémentaires">
          <textarea
            name="addressDetails"
            maxLength={500}
            rows={2}
            defaultValue={client?.addressDetails ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
      </fieldset>
      <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4">
        <legend className="px-2 font-bold">Comment le client a connu le salon</legend>
        <Field label="Source">
          <select
            name="discoverySource"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setReferrerId("");
            }}
            className={FIELD_CLASS}
          >
            {Object.entries(DISCOVERY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Précisions (réseau social, publicité, recherche…) ">
          <input
            name="discoveryDetails"
            maxLength={500}
            defaultValue={client?.discoveryDetails ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
        {source === "recommendation" && (
          <>
            <Field label="Recommandé par un client">
              <select
                name="referredByClientId"
                value={referrerId}
                onChange={(event) => setReferrerId(event.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Aucun client lié / autre personne</option>
                {referrers
                  .filter((row) => row.id !== client?.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.phone || row.email || "Sans coordonnées"}
                    </option>
                  ))}
              </select>
            </Field>
            {!referrerId && (
              <Field label="Ou nom de la personne qui recommande">
                <input
                  name="referrerName"
                  maxLength={120}
                  defaultValue={client?.referrerName ?? ""}
                  className={FIELD_CLASS}
                />
              </Field>
            )}
          </>
        )}
      </fieldset>
      <Field label="Préférences">
        <textarea
          className={FIELD_CLASS}
          name="preferences"
          rows={2}
          maxLength={2000}
          defaultValue={client?.preferences ?? ""}
          placeholder="Prestations, produits ou habitudes appréciés"
        />
      </Field>
      <Field label="Allergies et précautions">
        <textarea
          className={FIELD_CLASS}
          name="allergies"
          rows={2}
          maxLength={2000}
          defaultValue={client?.allergies ?? ""}
          placeholder="Informations communiquées par le client"
        />
      </Field>
      <Field label="Notes internes">
        <textarea
          className={FIELD_CLASS}
          name="notes"
          rows={3}
          maxLength={4000}
          defaultValue={client?.notes ?? ""}
        />
      </Field>
      <p className="text-xs text-stone-500">
        Ces informations sont réservées aux personnes autorisées à gérer le salon.
      </p>
      <FormFeedback state={state} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton>{client ? "Enregistrer les modifications" : "Créer le client"}</SubmitButton>
        {state.success && state.recordId && !client && (
          <Link
            className="text-sm font-bold text-emerald-800 underline"
            href={`/clients/${state.recordId}`}
          >
            Ouvrir la fiche client
          </Link>
        )}
      </div>
    </form>
  );
}

export function ClientStatusForm({ id, archived }: { id: string; archived: boolean }) {
  const [state, action] = useFormState(changeClientStatusAction, INITIAL_MUTATION_STATE);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="operation" value={archived ? "restore" : "archive"} />
      <SubmitButton secondary>
        {archived ? "Restaurer le client" : "Archiver le client"}
      </SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}
