interface Props {
  firstName: string
}

export function WelcomeHeader({ firstName }: Props) {
  return (
    <div className="px-5 pt-1">
      <h1 className="font-display text-2xl font-extrabold leading-tight text-white">
        Bem-vindo, <span className="text-secondary">{firstName}</span>!
      </h1>
    </div>
  )
}
