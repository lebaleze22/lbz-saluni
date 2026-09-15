"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { CirclePlus, Trash2 } from "lucide-react";
import { formatFcfa } from "@/lib/format";
import {
  Field,
  FIELD_CLASS,
  FormFeedback,
  INITIAL_MUTATION_STATE,
  SubmitButton,
} from "@/components/admin/form-controls";
import { createAppointmentAction } from "./actions";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  sex: string | null;
};
type Service = {
  id: string;
  name: string;
  defaultPrice: number;
  category: { name: string } | null;
};
type Staff = { id: string; name: string; jobTitles: Array<{ name: string; isPrimary: boolean }> };

export function AppointmentForm({
  clients,
  services,
  staff,
  initialClientId,
  initialStart,
}: {
  clients: Client[];
  services: Service[];
  staff: Staff[];
  initialClientId?: string;
  initialStart: string;
}) {
  const [state, action] = useFormState(createAppointmentAction, INITIAL_MUTATION_STATE);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [lines, setLines] = useState(() => [
    { key: 1, serviceId: services[0]?.id ?? "", price: services[0]?.defaultPrice ?? 0 },
  ]);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const selectedClient = clients.find((client) => client.id === clientId);
  const payload = useMemo(
    () => JSON.stringify(lines.map(({ serviceId, price }) => ({ serviceId, price }))),
    [lines],
  );
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.price, 0), [lines]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="services" value={payload} />
      <input type="hidden" name="clientName" value={selectedClient?.name ?? ""} />
      {selectedClient && <input type="hidden" name="phone" value={selectedClient.phone ?? ""} />}
      <Field label="Client existant ou nouveau">
        <select
          className={FIELD_CLASS}
          name="clientId"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">Nouveau client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
              {client.phone ? ` · ${client.phone}` : ""}
            </option>
          ))}
        </select>
      </Field>
      {!selectedClient && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du client">
            <input className={FIELD_CLASS} name="clientName" required maxLength={120} />
          </Field>
          <Field label="Téléphone">
            <input className={FIELD_CLASS} name="phone" maxLength={30} />
          </Field>
          <Field label="E-mail">
            <input className={FIELD_CLASS} name="email" type="email" maxLength={254} />
          </Field>
          <Field label="Sexe">
            <select className={FIELD_CLASS} name="sex" defaultValue="">
              <option value="">Non renseigné</option>
              <option value="femme">Femme</option>
              <option value="homme">Homme</option>
            </select>
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Personnel">
          <select className={FIELD_CLASS} name="staffId" required>
            <option value="">Sélectionner</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date et heure">
          <input
            className={FIELD_CLASS}
            name="startTime"
            type="datetime-local"
            required
            defaultValue={initialStart}
          />
        </Field>
        <Field label="Durée prévue (minutes)">
          <input
            className={FIELD_CLASS}
            name="durationMinutes"
            type="number"
            min={5}
            max={720}
            step={5}
            defaultValue={60}
            required
          />
        </Field>
      </div>
      <fieldset className="space-y-3">
        <div className="flex items-center justify-between">
          <legend className="font-bold">Prestations prévues</legend>
          <button
            type="button"
            disabled={lines.length >= services.length}
            onClick={() => {
              const next = services.find(
                (service) => !lines.some((line) => line.serviceId === service.id),
              );
              if (next)
                setLines((current) => [
                  ...current,
                  {
                    key: Math.max(...current.map((line) => line.key)) + 1,
                    serviceId: next.id,
                    price: next.defaultPrice,
                  },
                ]);
            }}
            className="flex items-center gap-1 text-sm font-bold text-emerald-800 disabled:opacity-40"
          >
            <CirclePlus className="size-4" /> Ajouter
          </button>
        </div>
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <select
              className={FIELD_CLASS}
              value={line.serviceId}
              onChange={(event) => {
                const selected = services.find((service) => service.id === event.target.value);
                setLines((current) =>
                  current.map((item) =>
                    item.key === line.key
                      ? {
                          ...item,
                          serviceId: event.target.value,
                          price: selected?.defaultPrice ?? 0,
                        }
                      : item,
                  ),
                );
              }}
              required
            >
              {services.map((service) => (
                <option
                  key={service.id}
                  value={service.id}
                  disabled={lines.some(
                    (item) => item.key !== line.key && item.serviceId === service.id,
                  )}
                >
                  {service.name}
                </option>
              ))}
            </select>
            <input
              aria-label={`Prix prestation ${index + 1}`}
              className={FIELD_CLASS}
              type="number"
              min={1}
              max={2147483647}
              value={line.price}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item) =>
                    item.key === line.key ? { ...item, price: Number(event.target.value) } : item,
                  ),
                )
              }
              required
            />
            <button
              type="button"
              aria-label="Retirer"
              disabled={lines.length === 1}
              onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
              className="rounded-xl p-3 text-stone-500 disabled:opacity-30"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </fieldset>
      <fieldset className="rounded-2xl bg-emerald-950 p-4 text-white">
        <legend className="font-black">Paiement à la réservation</legend>
        <p className="mt-1 text-xs text-emerald-200">
          Laissez le montant à zéro pour un rendez-vous non payé. Un acompte ne termine pas la
          prestation et ne consomme aucun stock.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold">
            <span>Montant encaissé</span>
            <input
              className="w-full rounded-xl border border-emerald-700 bg-emerald-900 px-3.5 py-3 text-white"
              name="paymentAmount"
              type="number"
              min={0}
              max={total}
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(Number(event.target.value))}
            />
          </label>
          <label className="space-y-2 text-sm font-semibold">
            <span>Méthode</span>
            <select
              className="w-full rounded-xl border border-emerald-700 bg-emerald-900 px-3.5 py-3 text-white disabled:opacity-50"
              name="paymentMethod"
              disabled={paymentAmount <= 0}
              defaultValue="cash"
            >
              <option value="cash">Espèces</option>
              <option value="orange_money">Orange Money</option>
              <option value="mtn_momo">MTN MoMo</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm font-bold">
          Total prévu : {formatFcfa(total)} · Solde après acompte :{" "}
          {formatFcfa(Math.max(0, total - paymentAmount))}
        </p>
      </fieldset>
      <Field label="Notes internes">
        <textarea className={FIELD_CLASS} name="notes" rows={3} maxLength={1000} />
      </Field>
      <FormFeedback state={state} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton>Planifier le rendez-vous</SubmitButton>
        {state.success && state.recordId && (
          <Link
            href={`/appointments/${state.recordId}`}
            className="font-bold text-emerald-800 underline"
          >
            Ouvrir le rendez-vous
          </Link>
        )}
      </div>
    </form>
  );
}
