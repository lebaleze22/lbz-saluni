"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, CirclePlus, Loader2, Trash2 } from "lucide-react";
import { formatFcfa } from "@/lib/format";
import type { ClientOption, ServiceOption, StaffOption } from "@/types/register";
import { submitRegisterEntry, type RegisterFormState } from "@/app/(admin)/register/actions";

type ServiceLine = {
  key: number;
  serviceId: string;
  price: number;
};

const INITIAL_STATE: RegisterFormState = { success: false, message: "" };

function nowForInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function digitsToAmount(value: string): number {
  return Number(value.replace(/\D/g, "")) || 0;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      {pending ? "Enregistrement…" : "Ajouter au registre"}
    </button>
  );
}

export function QuickEntryForm({
  staff,
  services,
  clients,
}: {
  staff: StaffOption[];
  services: ServiceOption[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(submitRegisterEntry, INITIAL_STATE);
  const defaultServiceId = services[0]?.id ?? "";
  const defaultServicePrice = services[0]?.defaultPrice ?? 0;
  const [source, setSource] = useState<"reservation" | "walk_in">("walk_in");
  const [startTime, setStartTime] = useState(nowForInput);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<ServiceLine[]>(() => [
    {
      key: 1,
      serviceId: defaultServiceId,
      price: defaultServicePrice,
    },
  ]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.price, 0), [lines]);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    setSource("walk_in");
    setStartTime(nowForInput());
    setPaymentMethod("cash");
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
      <input type="hidden" name="source" value={source} />
      <input
        type="hidden"
        name="startTime"
        value={startTime ? new Date(startTime).toISOString() : ""}
      />
      <input type="hidden" name="services" value={JSON.stringify(lines)} />
      <input type="hidden" name="paymentAmount" value={total} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          <span>Nom du client</span>
          <input
            name="clientName"
            list="clients-connus"
            required
            autoComplete="off"
            placeholder="Ex. Grâce N."
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          />
          <datalist id="clients-connus">
            {clients.map((client) => (
              <option key={client.id} value={client.name}>
                {client.phone ?? "Téléphone non renseigné"}
              </option>
            ))}
          </datalist>
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
          <span>Heure de la visite</span>
          <input
            type="datetime-local"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-stone-700">Origine de la visite</legend>
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

      <fieldset className="space-y-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-semibold text-stone-700">Prestations</legend>
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
              Paiement encaissé
            </legend>
            <p className="mt-1 text-xs text-emerald-200/80">Somme des prestations</p>
          </div>
          <output className="text-xl font-black">{formatFcfa(total)}</output>
        </div>
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
      <SubmitButton />
    </form>
  );
}
