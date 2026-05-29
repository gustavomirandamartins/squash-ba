interface Props {
  firstName: string
  gender?: string | null
}

export function WelcomeHeader({ firstName, gender }: Props) {
  const greeting = gender === 'feminino' ? 'Bem-vinda' : 'Bem-vindo'
  return (
    <div className="px-5 pt-1">
      <h1 className="font-display text-2xl font-extrabold leading-tight text-white">
        {greeting}, <span className="text-secondary">{firstName}</span>!
      </h1>
    </div>
  )
}
