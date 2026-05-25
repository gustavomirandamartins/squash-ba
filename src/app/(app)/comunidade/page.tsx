import { Users } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Comunidade" };

export default function ComunidadePage() {
  return (
    <ComingSoon
      icon={Users}
      title="Comunidade"
      description="Em breve: seu perfil, jogadores que você segue, quadras da Bahia e o feed da turma do squash."
    />
  );
}
