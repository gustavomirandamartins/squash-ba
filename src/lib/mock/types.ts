export type Seed =
  | "salvador"
  | "barra"
  | "pituba"
  | "ondina"
  | "rio-vermelho"
  | "itapua"
  | "stiep"
  | "graca";

export interface Story {
  id: string;
  label: string;
  seed: Seed;
  live?: boolean;
}

export interface Player {
  name: string;
  club: string;
  seed: Seed;
}

export interface Match {
  id: string;
  championship: string;
  round: string;
  date: string;
  time: string;
  status: "ao-vivo" | "agendado" | "encerrado";
  court: string;
  home: Player;
  away: Player;
  seed: Seed;
}

export interface FeedItem {
  id: string;
  kind: "noticia" | "destaque" | "resultado";
  title: string;
  excerpt: string;
  author: string;
  timeAgo: string;
  seed: Seed;
  likes: string;
  comments: string;
}
