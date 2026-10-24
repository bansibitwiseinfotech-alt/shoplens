import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const searchParams = url.search;
  return redirect(`/app/zero-result-search${searchParams}`);
};

export default function MissedSalesOpportunitiesRoute() {
  return null;
}