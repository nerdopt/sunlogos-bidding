import { PlayerApp } from "@/components/PlayerApp";

export default async function PlayerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlayerApp code={code} />;
}
