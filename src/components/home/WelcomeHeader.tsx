interface Props {
  firstName: string
}

export function WelcomeHeader({ firstName }: Props) {
  return (
    <div className="px-5 pt-1">
      <p className="text-xs font-medium uppercase tracking-widest text-secondary/80">SquashBa</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-white">
        Bem-vindo, <span className="text-secondary">{firstName}</span>!
      </h1>
    </div>
  )
}
