import { getExpensesPageData } from "@/lib/db/expenses";
import { ExpenseManager } from "@/app/(admin)/(director)/expenses/expense-manager";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const expenses = await getExpensesPageData();
  return <ExpenseManager expenses={expenses} />;
}
