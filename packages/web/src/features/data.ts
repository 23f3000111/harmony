import type { ChecklistDTO, ItemDTO, MemberStats, RecipeDTO, RestockDTO, SupplierDTO } from '@harmony/shared';
import { useWQuery, useWorkspace } from '@/lib/workspace';

export const useMembers = () => useWQuery<{ members: MemberStats[] }>('members', '/members', { staleTime: 30_000 });
export const useItems = () => useWQuery<{ items: ItemDTO[] }>('items', '/items');
export const useRestock = () => useWQuery<{ entries: RestockDTO[] }>('restock', '/restock');
export const useChecklists = () => useWQuery<{ checklists: ChecklistDTO[] }>('checklists', '/checklists');

export function useSuppliers() {
  const { features } = useWorkspace();
  return useWQuery<{ suppliers: SupplierDTO[] }>('suppliers', '/suppliers', { enabled: features.suppliers, staleTime: 30_000 });
}

export function useRecipes() {
  const { features } = useWorkspace();
  return useWQuery<{ recipes: RecipeDTO[] }>('recipes', '/meals/recipes/all', { enabled: features.meals, staleTime: 30_000 });
}

/** Names for people by id, so rows can show who's doing what. */
export function useMemberNames() {
  const members = useMembers();
  const map = new Map((members.data?.members ?? []).map((member) => [member.id, member]));
  return { map, list: members.data?.members ?? [], loading: members.isPending };
}
