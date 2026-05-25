import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Campeonatos" };

export default function CampeonatosPage() {
  return (
    <ComingSoon
      icon={CalendarDays}
      title="Campeonatos"
      description="Em breve: calendário das etapas da Liga Baiana, chaves, tabelas e classificação ao vivo."
    />
  );
}
