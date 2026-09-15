"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dateTimeInDouala, doualaInputToIso } from "@/lib/dates";
import { CheckCircle2, CirclePlus, Loader2, Trash2 } from "lucide-react";
import { formatFcfa } from "@/lib/format";
import { groupByServiceCategory } from "@/lib/services/group-by-category";
import type { ClientOption, ServiceOption, StaffOption } from "@/types/register";
import {
  submitRegisterEntry,
  type RegisterFormState,
} from "@/app/(admin)/(director)/register/actions";

type ServiceLine = {
  key: number;
  serviceId: string;
  price: number;
};

const INITIAL_STATE: RegisterFormState = { success: false, message: "" };

function nowForInput() {
  return dateTimeInDouala();
}

function digitsToAmount(value: string): number {
  return Number(value.replace(/\D/g, "")) || 0;
}

function SubmitButton({ mode }: { mode: "completed_visit" | "appointment" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      {pending
        ? "Enregistrement…"
        : mode === "appointment"
          ? "Planifier le rendez-vous"
          : "Enregistrer la visite réalisée"}
    </button>
  );
}

export function QuickEntryForm({
  staff,
  services,
  clients,
  initialClientId,
}: {
  staff: StaffOption[];
  services: ServiceOption[];
  clients: ClientOption[];
  initialClientId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(submitRegisterEntry, INITIAL_STATE);
  const defaultServiceId = services[0]?.id ?? "";
  const defaultServicePrice = services[0]?.defaultPrice ?? 0;
  const [entryMode, setEntryMode] = useState<"completed_visit" | "appointment">("completed_visit");
  const [source, setSource] = useState<"reservation" | "walk_in">("walk_in");
  const initialClient = clients.find((client) => client.id === initialClientId);
  const [clientId, setClientId] = useState(initialClient?.id ?? "");
  const [clientName, setClientName] = useState(initialClient?.name ?? "");
  const [clientEmail, setClientEmail] = useState(initialClient?.email ?? "");
  const [clientPhone, setClientPhone] = useState(initialClient?.phone ?? "");
  const [clientSex, setClientSex] = useState<"" | "femme" | "homme">(initialClient?.sex ?? "");
  const [startTime, setStartTime] = useState(nowForInput);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [appointmentPayment, setAppointmentPayment] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<ServiceLine[]>(() => [
    {
      key: 1,
      serviceId: defaultServiceId,
      price: defaultServicePrice,
    },
  ]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.price, 0), [lines]);
  const serviceGroups = useMemo(() => groupByServiceCategory(services), [services]);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    setEntryMode("completed_visit");
    setSource("walk_in");
    setClientSex("");
    setClientId("");
    setClientName("");
    setClientPhone("");
    setClientEmail("");
    setStartTime(nowForInput());
    setPaymentMethod("cash");
    setAppointmentPayment(0);
    setDurationMinutes(60);
    setLines([
      {
        key: Date.now(),
        serviceId: defaultServiceId,
        price: defaultServicePrice,
      },
    ]);
    router.refresh();
  }, [defaultServiceId, defaultServicePrice, router, state.submissionId, state.success]);

  const updateService = (key: number, serviceId: string) => {
    const service = services.find((item) => item.id === serviceId);
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, serviceId, price: service?.defaultPrice ?? 0 } : line,
      ),
    );
  };

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <input type="hidden" name="entryMode" value={entryMode} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="sex" value={clientSex} />
      <input type="hidden" name="startTime" value={doualaInputToIso(startTime)} />
      <input type="hidden" name="services" value={JSON.stringify(lines)} />
      <input
        type="hidden"
        name="paymentAmount"
        value={entryMode === "appointment" ? appointmentPayment : total}
      />
      <input type="hidden" name="durationMinutes" value={durationMinutes} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-stone-700">Action à effectuer</legend>
        <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1">
          {(
            [
              ["completed_visit", "Visite réalisée"],
              ["appointment", "Rendez-vous à venir"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={entryMode === value}
              onClick={() => {
                setEntryMode(value);
                if (value === "appointment") {
                  setSource("reservation");
                  setAppointmentPayment(0);
                }
              }}
              className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                entryMode === value ? "bg-white text-emerald-950 shadow-sm" : "text-stone-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Un rendez-vous reste planifié même lorsqu’un acompte est encaissé. Le stock sera consommé
          uniquement après la prestation.
        </p>
      </fieldset>

      <div className="space-y-2">
        <label className="block space-y-2 text-sm font-semibold text-stone-700">
          <span>Fiche client</span>
          <select
            value={clientId}
            onChange={(event) => {
              const selected = clients.find((client) => client.id === event.target.value);
              setClientId(selected?.id ?? "");
              setClientName(selected?.name ?? "");
              setClientPhone(selected?.phone ?? "");
              setClientEmail(selected?.email ?? "");
              setClientSex(selected?.sex ?? "");
            }}
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm"
          >
            <option value="">Nouveau client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.phone ? ` · ${client.phone}` : " · Sans téléphone"}
                {client.email ? ` · ${client.email}` : ""}
                {client.sex ? ` · ${client.sex}` : ""}
              </option>
            ))}
          </select>
        </label>
        <Link className="text-xs font-bold text-emerald-800 underline" href="/clients">
          Rechercher dans toutes les fiches clients
        </Link>
        {initialClientId && !initialClient && (
          <p role="alert" className="text-xs text-amber-800">
            La fiche demandée est indisponible. Sélectionnez un client actif.
          </p>
        )}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          <span>Nom du client</span>
          <input
            name="clientName"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            readOnly={Boolean(clientId)}
            required
            autoComplete="off"
            placeholder="Ex. Grâce N."
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          />
          {state.errors?.clientName?.map((error) => (
            <span key={error} className="block text-xs font-medium text-red-700">
              {error}
            </span>
          ))}
        </label>
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          <span>
            Téléphone <span className="font-normal text-stone-400">(optionnel)</span>
          </span>
          <input
            name="phone"
            value={clientPhone}
            onChange={(event) => setClientPhone(event.target.value)}
            readOnly={Boolean(clientId)}
            type="tel"
            placeholder="Ex. 6 99 00 00 00"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          />
          {state.errors?.phone?.map((error) => (
            <span key={error} className="block text-xs font-medium text-red-700">
              {error}
            </span>
          ))}
        </label>
      </fieldset>

      <label className="block space-y-2 text-sm font-semibold text-stone-700">
        <span>E-mail (optionnel)</span>
        <input
          name="email"
          type="email"
          maxLength={254}
          value={clientEmail}
          onChange={(event) => setClientEmail(event.target.value)}
          readOnly={Boolean(clientId)}
          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal"
        />
        {state.errors?.email?.map((error) => (
          <span key={error} className="block text-xs text-red-700">
            {error}
          </span>
        ))}
      </label>
      <p className="text-xs text-stone-500">
        Le nom, le téléphone, l’e-mail et le sexe sont comparés ensemble pour éviter les doublons.
        Sélectionnez la fiche existante pour un client déjà connu.
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-stone-700">
          Sexe du client <span className="font-normal text-stone-400">(optionnel)</span>
        </legend>
        <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1">
          {(
            [
              ["femme", "Femme"],
              ["homme", "Homme"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={clientSex === value}
              disabled={Boolean(clientId)}
              onClick={() => setClientSex((current) => (current === value ? "" : value))}
              className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                clientSex === value ? "bg-white text-emerald-950 shadow-sm" : "text-stone-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          <span>Personnel</span>
          <select
            name="staffId"
            required
            defaultValue=""
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="" disabled>
              Sélectionner
            </option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.jobTitles.length > 0
                  ? ` — ${member.jobTitles.map((title) => title.name).join(", ")}`
                  : ""}
              </option>
            ))}
          </select>
          {state.errors?.staffId?.map((error) => (
            <span key={error} className="block text-xs font-medium text-red-700">
              {error}
            </span>
          ))}
        </label>
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          <span>
            {entryMode === "appointment" ? "Date du rendez-vous" : "Heure de la visite"} (Douala)
          </span>
          <input
            type="datetime-local"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
      </fieldset>

      {entryMode === "appointment" && (
        <label className="block space-y-2 text-sm font-semibold text-stone-700">
          <span>Durée prévue (minutes)</span>
          <input
            type="number"
            min={5}
            max={720}
            step={5}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal"
          />
        </label>
      )}

      {entryMode === "completed_visit" && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-stone-700">
            Origine de la visite
          </legend>
          <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1">
            {[
              ["walk_in", "Passage"],
              ["reservation", "Réservation"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSource(value as typeof source)}
                className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                  source === value ? "bg-white text-emerald-950 shadow-sm" : "text-stone-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <legend className="text-sm font-semibold text-stone-700">Prestations</legend>
            <p className="mt-0.5 text-xs text-stone-400">
              Le prix proposé est modifiable pour cette visite.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLines((current) => [
                ...current,
                {
                  key: nextKey,
                  serviceId:
                    services.find(
                      (service) => !current.some((line) => line.serviceId === service.id),
                    )?.id ?? "",
                  price:
                    services.find(
                      (service) => !current.some((line) => line.serviceId === service.id),
                    )?.defaultPrice ?? 0,
                },
              ]);
              setNextKey((key) => key + 1);
            }}
            disabled={lines.length >= services.length}
            className="flex items-center gap-1.5 text-sm font-bold text-emerald-800 disabled:opacity-40"
          >
            <CirclePlus className="size-4" /> Ajouter
          </button>
        </div>
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="grid grid-cols-[1fr_9.5rem_auto] gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2"
          >
            <label className="sr-only" htmlFor={`service-${line.key}`}>
              Prestation {index + 1}
            </label>
            <select
              id={`service-${line.key}`}
              value={line.serviceId}
              required
              onChange={(event) => updateService(line.key, event.target.value)}
              className="min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
            >
              <option value="" disabled>
                Sélectionner
              </option>
              {serviceGroups.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  {group.items.map((service) => (
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
                </optgroup>
              ))}
            </select>
            <label className="sr-only" htmlFor={`price-${line.key}`}>
              Prix de la prestation
            </label>
            <input
              id={`price-${line.key}`}
              type="text"
              inputMode="numeric"
              required
              value={line.price ? formatFcfa(line.price) : ""}
              onChange={(event) => {
                const price = digitsToAmount(event.target.value);
                setLines((current) =>
                  current.map((item) => (item.key === line.key ? { ...item, price } : item)),
                );
              }}
              className="min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-right text-sm font-semibold outline-none focus:border-emerald-700"
            />
            <button
              type="button"
              aria-label={`Retirer la prestation ${index + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
              className="rounded-lg p-2.5 text-stone-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-25"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {state.errors?.services?.map((error) => (
          <span key={error} className="block text-xs font-medium text-red-700">
            {error}
          </span>
        ))}
      </fieldset>

      <fieldset className="rounded-2xl bg-emerald-950 p-4 text-white">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <legend className="text-xs font-bold uppercase tracking-wider text-emerald-200">
              {entryMode === "appointment" ? "Paiement du rendez-vous" : "Paiement encaissé"}
            </legend>
            <p className="mt-1 text-xs text-emerald-200/80">
              {entryMode === "appointment"
                ? "Aucun paiement ou acompte facultatif"
                : "Somme des prestations"}
            </p>
          </div>
          <output className="text-xl font-black">
            {formatFcfa(entryMode === "appointment" ? appointmentPayment : total)}
          </output>
        </div>
        {entryMode === "appointment" && (
          <label className="mb-4 block space-y-2 text-sm font-semibold">
            <span>Montant encaissé maintenant</span>
            <input
              type="text"
              inputMode="numeric"
              value={appointmentPayment ? formatFcfa(appointmentPayment) : ""}
              placeholder="0 FCFA — rendez-vous non payé"
              onChange={(event) => setAppointmentPayment(digitsToAmount(event.target.value))}
              className="w-full rounded-xl border border-emerald-700 bg-emerald-900 px-3.5 py-3 text-white placeholder:text-emerald-300"
            />
            <span className="block text-xs font-normal text-emerald-200">
              Maximum : {formatFcfa(total)}
            </span>
          </label>
        )}
        <label className="space-y-2 text-sm font-semibold">
          <span>Méthode de paiement</span>
          <select
            name="paymentMethod"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="w-full rounded-xl border border-emerald-700 bg-emerald-900 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <option value="cash">Espèces</option>
            <option value="orange_money">Orange Money</option>
            <option value="mtn_momo">MTN MoMo</option>
          </select>
        </label>
      </fieldset>

      {state.message && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </p>
      )}
      <SubmitButton mode={entryMode} />
    </form>
  );
}
