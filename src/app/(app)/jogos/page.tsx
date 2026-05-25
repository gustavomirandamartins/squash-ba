import { Play } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Jogos" };

export default function JogosPage() {
  return (
    <ComingSoon
      icon={Play}
      title="Jogos"
      description="Em breve: transmissões ao vivo, melhores momentos e placares das partidas da comunidade."
    />
  );
}
