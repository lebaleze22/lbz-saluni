import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export async function verifyAppHttp(env, root) {
  if (env.SALUNI_DISPOSABLE_TEST !== "1") throw new Error("Disposable QA environment required.");
  const db = new PrismaClient({ datasourceUrl: env.ADMIN_DATABASE_URL });
  const admin = createClient(env.SUPABASE_PUBLIC_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authIds = [];
  let tenant;
  let server;
  try {
    tenant = await db.tenant.create({ data: { name: `QA HTTP ${randomUUID()}` } });
    async function account(role) {
      const email = `${randomUUID()}@qa.invalid`;
      const password = `QA-http-${randomUUID()}`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      authIds.push(created.data.user.id);
      await db.user.create({
        data: {
          id: created.data.user.id,
          tenantId: tenant.id,
          email,
          fullName: `QA ${role}`,
          role,
        },
      });
      const staff = await db.staff.create({
        data: {
          tenantId: tenant.id,
          userId: created.data.user.id,
          name: `QA ${role}`,
          systemRole: role === "salon_admin" ? "director" : "manager",
        },
      });
      const jar = new Map();
      const auth = createServerClient(env.SUPABASE_PUBLIC_URL, env.SUPABASE_ANON_KEY, {
        cookieOptions: { name: "saluni-auth" },
        cookies: {
          getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
          setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)),
        },
      });
      const login = await auth.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      return {
        cookie: Array.from(jar, ([name, value]) => `${name}=${value}`).join("; "),
        userId: created.data.user.id,
        staffId: staff.id,
      };
    }
    const owner = await account("owner");
    const director = await account("salon_admin");
    const manager = await account("manager");
    const ownerCookie = owner.cookie;
    const directorCookie = director.cookie;
    const managerCookie = manager.cookie;
    const client = await db.client.create({
      data: {
        tenantId: tenant.id,
        name: "QA HTTP Client",
        notes: "QA private note",
        allergies: "QA declared precaution",
      },
    });
    const product = await db.product.create({
      data: {
        tenantId: tenant.id,
        name: "QA HTTP Shampoo",
        sku: "QA-HTTP-1",
        unit: "ml",
        salePrice: 2500,
        stockQuantity: "8",
        lowStockThreshold: "10",
      },
    });
    const movement = await db.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        recordedById: owner.userId,
        type: "sale",
        quantity: "-2",
        balanceAfter: "8",
        productName: product.name,
        unit: product.unit,
        unitCost: product.costPrice,
        reason: "Vente produit",
      },
    });
    const retailSale = await db.retailSale.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        productId: product.id,
        recordedById: owner.userId,
        stockMovementId: movement.id,
        productName: product.name,
        unit: product.unit,
        quantity: "2",
        unitPrice: 2500,
        total: 5000,
        method: "orange_money",
        soldAt: new Date(),
      },
    });
    const service = await db.service.create({
      data: { tenantId: tenant.id, name: "QA HTTP Service", defaultPrice: 1000 },
    });
    await db.serviceProduct.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        serviceId: service.id,
        quantity: "0.125",
      },
    });
    const appointmentDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const appointmentDay = new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Africa/Douala",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(appointmentDate);
    const scheduledAppointment = await db.appointment.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        staffId: owner.staffId,
        createdById: owner.userId,
        source: "reservation",
        startTime: appointmentDate,
        durationMinutes: 60,
        status: "scheduled",
        notes: "QA HTTP appointment note",
        appointmentServices: {
          create: { serviceId: service.id, price: 1000 },
        },
      },
    });
    const socket = createServer();
    await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"],
      {
        cwd: root,
        env: { ...process.env, ...env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    // Consume logs without exposing session information in normal QA output.
    server.stdout.resume();
    server.stderr.resume();
    let startError;
    server.on("error", (error) => {
      startError = error;
    });
    for (let attempt = 0; ; attempt++) {
      if (startError) throw startError;
      if (server.exitCode !== null) throw new Error("QA Next.js server exited before startup.");
      const ready = await fetch(`${base}/login`, { signal: AbortSignal.timeout(3000) })
        .then((response) => response.ok)
        .catch(() => false);
      if (ready) break;
      if (attempt >= 59) throw new Error("QA application did not start. Run npm run build first.");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    async function page(route, cookie, expected) {
      const response = await fetch(base + route, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200, `${route}: expected authenticated page`);
      const html = await response.text();
      assert.ok(html.includes(expected), `${route}: missing expected rendered content`);
      assert.ok(!html.includes('id="__next_error__"'), `${route}: server render error`);
      console.log(`HTTP PASS ${route.split("?")[0]}`);
    }
    const routes = [
      ["/clients", "QA HTTP Client"],
      [`/clients/${client.id}`, "QA HTTP Shampoo"],
      ["/inventory", "QA HTTP Shampoo"],
      [`/inventory/${product.id}`, "QA HTTP Service"],
      [`/inventory/recipes?serviceId=${service.id}`, "QA HTTP Shampoo"],
      [`/register?clientId=${client.id}`, "QA HTTP Client"],
      [`/appointments?date=${appointmentDay}`, "QA HTTP Client"],
      [`/appointments/${scheduledAppointment.id}`, "QA HTTP appointment note"],
      ["/sales", "QA HTTP Shampoo"],
      [`/sales/${retailSale.id}`, retailSale.id],
      ["/reports", "Ventes produits"],
    ];
    for (const [route, expected] of routes) await page(route, ownerCookie, expected);
    await page("/clients", directorCookie, "QA HTTP Client");
    await page("/inventory", directorCookie, "QA HTTP Shampoo");
    await page("/sales", directorCookie, "QA HTTP Shampoo");
    await page(`/appointments?date=${appointmentDay}`, directorCookie, "QA HTTP Client");

    let response = await fetch(base + "/reports/export/excel?period=week", {
      headers: { cookie: ownerCookie },
    });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type")?.includes("spreadsheetml"));
    const reportBytes = new Uint8Array(await response.arrayBuffer());
    const XLSX = await import("xlsx");
    const reportBook = XLSX.read(reportBytes, { type: "array", raw: true });
    assert.ok(reportBook.SheetNames.includes("Ventes produits"));
    assert.ok(
      JSON.stringify(XLSX.utils.sheet_to_json(reportBook.Sheets["Ventes produits"])).includes(
        "QA HTTP Shampoo",
      ),
    );
    response = await fetch(base + "/reports/export/pdf?period=week", {
      headers: { cookie: ownerCookie },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(
      Buffer.from(await response.arrayBuffer())
        .subarray(0, 4)
        .toString(),
      "%PDF",
    );
    console.log("HTTP PASS product revenue in Excel and PDF report exports");
    const csv = `Nom;Email;Notes;Ville;Quartier;Adresse;Source;ID client recommandant\r\nQA Import HTTP;import@qa.invalid;Imported note;Douala;Bonapriso;Rue QA;recommendation;${client.id}`;
    async function upload(mode, content = csv, origin = base) {
      const body = new FormData();
      body.set("file", new Blob([content], { type: "text/csv" }), "clients.csv");
      body.set("mode", mode);
      return fetch(base + "/clients/import", {
        method: "POST",
        body,
        headers: { cookie: ownerCookie, origin },
        redirect: "manual",
      });
    }
    response = await upload("preview");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).added, 1);
    assert.equal(
      await db.client.count({ where: { tenantId: tenant.id, email: "import@qa.invalid" } }),
      0,
    );
    response = await upload("import");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).added, 1);
    const imported = await db.client.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "import@qa.invalid" },
    });
    assert.equal(imported.city, "Douala");
    assert.equal(imported.neighbourhood, "Bonapriso");
    assert.equal(imported.referredByClientId, client.id);
    response = await upload("import");
    assert.equal((await response.json()).skipped, 1);
    response = await upload("import", "Nom;Email\r\nInvalid;bad-email");
    assert.equal(response.status, 400);
    response = await upload("import", csv, "https://foreign.invalid");
    assert.equal(response.status, 403);
    for (const format of ["csv", "xlsx"]) {
      response = await fetch(base + `/clients/export?format=${format}`, {
        headers: { cookie: directorCookie },
      });
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("content-disposition").includes(`.${format}`));
      const bytes = new Uint8Array(await response.arrayBuffer());
      const XLSX = await import("xlsx");
      const book = XLSX.read(bytes, { type: "array", raw: true });
      assert.ok(
        JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]])).includes(
          "QA Import HTTP",
        ),
      );
    }
    response = await fetch(base + "/clients/export?format=csv", {
      headers: { cookie: managerCookie },
      redirect: "manual",
    });
    assert.ok(response.status >= 300);
    console.log(
      "HTTP PASS 8 import/export checks (preview, commit, duplicate, invalid data, origin, CSV, Excel, permissions)",
    );

    const inventoryHeaders = [
      "ID produit",
      "SKU",
      "Nom",
      "Unité",
      "Prix coût FCFA",
      "Prix vente FCFA",
      "Seuil stock bas",
      "Stock physique",
      "Statut",
    ];
    const inventoryRows = [
      [product.id, "QA-HTTP-1", "QA HTTP Shampoo updated", "ml", "0", "2600", "5", "7", "active"],
      ["", "QA-HTTP-2", "QA HTTP New Product", "unité", "100", "500", "1", "3", "active"],
    ];
    const inventoryCsv = [inventoryHeaders, ...inventoryRows]
      .map((row) => row.map((value) => `"${value}"`).join(";"))
      .join("\r\n");
    async function uploadInventory(
      mode,
      content = inventoryCsv,
      filename = "stock.csv",
      type = "text/csv",
      origin = base,
      cookie = ownerCookie,
    ) {
      const body = new FormData();
      body.set("file", new Blob([content], { type }), filename);
      body.set("mode", mode);
      return fetch(base + "/inventory/import", {
        method: "POST",
        body,
        headers: { cookie, origin },
        redirect: "manual",
      });
    }
    response = await uploadInventory("preview");
    assert.equal(response.status, 200);
    assert.deepEqual(
      (({ created, updated, unchanged, rejected }) => ({ created, updated, unchanged, rejected }))(
        await response.json(),
      ),
      { created: 1, updated: 1, unchanged: 0, rejected: 0 },
    );
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } })).salePrice,
      2500,
    );
    response = await uploadInventory("import");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).created, 1);
    const importedProduct = await db.product.findFirstOrThrow({
      where: { tenantId: tenant.id, sku: "QA-HTTP-2" },
    });
    assert.equal(importedProduct.stockQuantity.toString(), "3");
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity.toString(),
      "7",
    );
    response = await uploadInventory("import");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).unchanged, 2);
    response = await uploadInventory(
      "import",
      [inventoryHeaders, inventoryRows[0], [...inventoryRows[1].slice(0, 7), "-1", "active"]]
        .map((row) => row.map((value) => `"${value}"`).join(";"))
        .join("\r\n"),
    );
    assert.equal(response.status, 400);
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity.toString(),
      "7",
    );
    response = await uploadInventory(
      "preview",
      inventoryCsv,
      "stock.csv",
      "text/csv",
      "https://foreign.invalid",
    );
    assert.equal(response.status, 403);
    const XLSXInventory = await import("xlsx");
    const inventorySheet = XLSXInventory.utils.aoa_to_sheet([
      inventoryHeaders,
      ["", "QA-HTTP-3", "QA HTTP Excel Product", "g", 50, 100, 1, 2, "active"],
    ]);
    const inventoryBook = XLSXInventory.utils.book_new();
    XLSXInventory.utils.book_append_sheet(inventoryBook, inventorySheet, "Stock");
    response = await uploadInventory(
      "import",
      XLSXInventory.write(inventoryBook, { type: "buffer", bookType: "xlsx" }),
      "stock.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).created, 1);
    for (const format of ["csv", "xlsx"]) {
      response = await fetch(base + `/inventory/template?format=${format}`, {
        headers: { cookie: directorCookie },
      });
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("content-disposition").includes(`.${format}`));
    }
    response = await uploadInventory(
      "preview",
      inventoryCsv,
      "stock.csv",
      "text/csv",
      base,
      managerCookie,
    );
    assert.equal(response.status, 403);
    console.log(
      "HTTP PASS 10 inventory import checks (preview, atomic CSV commit, unchanged retry, invalid rollback, origin, Excel, templates, permissions)",
    );
    for (const [route, cookie, target] of [
      ["/clients", "", "/login"],
      ["/inventory", managerCookie, "/login"],
      ["/appointments", managerCookie, "/login"],
      ["/sales", managerCookie, "/login"],
      ["/staff", directorCookie, "/register"],
    ]) {
      const response = await fetch(base + route, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
      });
      // App Router can send a streamed redirect; check its actual destination too.
      const html = await response.text();
      const location = response.headers.get("location");
      assert.ok(
        location?.endsWith(target) || (html.includes("NEXT_REDIRECT") && html.includes(target)),
        `${route}: expected access redirect to ${target}`,
      );
      assert.ok(!html.includes("QA private note"));
      console.log(`HTTP PASS access guard ${route}`);
    }
    console.log(
      "39 authenticated rendering/access, appointment, report export, and file-transfer checks passed. These are HTTP checks, not browser visual tests.",
    );
  } finally {
    if (server && server.exitCode === null) {
      const stopped = once(server, "exit");
      server.kill();
      await stopped;
    }
    if (tenant) {
      const where = { tenantId: tenant.id };
      await db.serviceProduct.deleteMany({ where });
      await db.retailSale.deleteMany({ where });
      await db.stockMovement.deleteMany({ where });
      await db.payment.deleteMany({ where });
      await db.appointmentService.deleteMany({ where });
      await db.appointment.deleteMany({ where });
      await db.product.deleteMany({ where });
      await db.service.deleteMany({ where });
      await db.client.deleteMany({ where });
      await db.staff.deleteMany({ where });
      await db.user.deleteMany({ where });
      await db.tenant.delete({ where: { id: tenant.id } });
    }
    for (const id of authIds) await admin.auth.admin.deleteUser(id);
    await db.$disconnect();
  }
}
