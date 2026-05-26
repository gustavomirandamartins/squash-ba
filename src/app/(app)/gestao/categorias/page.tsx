import { createClient } from '@/utils/supabase/server'
import { CategoryList } from '@/components/gestao/CategoryList'

export const metadata = { title: 'Categorias · Gestão' }

export default async function CategoriasPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .order('name')

  return (
    <div className="px-5 py-4">
      <CategoryList initialCategories={categories ?? []} />
    </div>
  )
}
