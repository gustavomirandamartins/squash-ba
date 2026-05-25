import type { Story, Match, FeedItem } from "./types";

export const filters = ["Em Alta", "Seguindo", "Campeonatos", "Quadras", "Ranking"];

export const stories: Story[] = [
  { id: "s1", label: "Final ao vivo", seed: "salvador", live: true },
  { id: "s2", label: "Lucas Andrade", seed: "barra" },
  { id: "s3", label: "Quadra Pituba", seed: "pituba" },
  { id: "s4", label: "Mariana Sá", seed: "ondina" },
  { id: "s5", label: "Treino aberto", seed: "rio-vermelho" },
  { id: "s6", label: "Sub-17", seed: "itapua" },
];

export const heroMatch: Match = {
  id: "m1",
  championship: "Liga Baiana de Squash",
  round: "Final · Jogo 5",
  date: "Sáb 14/06",
  time: "19:30",
  status: "ao-vivo",
  court: "Arena Salvador · Quadra 1",
  seed: "salvador",
  home: { name: "Lucas Andrade", club: "Squash Barra", seed: "barra" },
  away: { name: "Rafael Nunes", club: "Pituba Squash", seed: "pituba" },
};

export const feed: FeedItem[] = [
  {
    id: "f1",
    kind: "resultado",
    title: "Mariana Sá vira o jogo e fecha a semifinal em 3 a 2",
    excerpt:
      "Depois de sair perdendo por 2 sets, a número 1 de Ondina dominou os games finais e garante vaga na decisão de sábado.",
    author: "Redação SquashBa",
    timeAgo: "há 2 h",
    seed: "ondina",
    likes: "1.2 mil",
    comments: "184",
  },
  {
    id: "f2",
    kind: "noticia",
    title: "Nova quadra de vidro é inaugurada no Rio Vermelho",
    excerpt:
      "Espaço com arquibancada para 120 pessoas amplia o circuito amador e já recebe a próxima etapa da Liga.",
    author: "Comunidade · Stiep Squash",
    timeAgo: "há 6 h",
    seed: "rio-vermelho",
    likes: "843",
    comments: "97",
  },
  {
    id: "f3",
    kind: "destaque",
    title: "Categoria Sub-17 bate recorde de inscritos na temporada",
    excerpt:
      "A base do squash baiano cresce: 64 jovens disputam a nova etapa entre Salvador e Lauro de Freitas.",
    author: "Federação Baiana",
    timeAgo: "ontem",
    seed: "itapua",
    likes: "612",
    comments: "58",
  },
];

export const currentUser = {
  name: "Gustavo Martins",
  handle: "@gustavo",
  seed: "graca" as const,
};
