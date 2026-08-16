import { redirect } from "next/navigation";

// History moved into the Account page — keep this route around as a
// redirect so old bookmarks/links to /history don't 404.
export default function HistoryPage() {
  redirect("/account");
}
