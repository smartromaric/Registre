"use client";

/**
 * DataTable — tableau de données générique, pagination serveur (TanStack Table +
 * TanStack Query côté appelant). Construit pour la vue liste des fiches
 * (cahier des charges §14.3 : rester fluide avec ~10 000 lignes) mais ne connaît
 * rien du domaine "fiche" — l'équipe Stock peut le réutiliser tel quel pour la
 * liste des articles.
 *
 * API :
 *   <DataTable
 *     columns={columns}                 // ColumnDef<TData, unknown>[] (TanStack Table)
 *     data={page.items}                 // seulement la page courante, jamais tout le jeu de données
 *     getRowId={(row) => row.id}
 *     isLoading={query.isFetching}
 *     error={query.error?.message}      // état d'échec honnête : jamais confondu avec "vide"
 *     onRetry={() => query.refetch()}
 *     emptyState={<.../>}                // affiché seulement quand le chargement a réussi et total === 0
 *     pagination={{ pageIndex, pageSize, total }}
 *     onPageChange={setPageIndex}
 *     onRowClick={(row) => router.push(...)}
 *   />
 *
 * Pagination réellement côté serveur : ce composant ne reçoit jamais que la page
 * courante (`data`) et un `total` ; il ne charge, ne trie et ne filtre rien en
 * mémoire au-delà de ce qu'on lui donne. Le tri (`sorting`/`onSortingChange`) est
 * pris en charge par TanStack Table mais reste optionnel et **manuel** — c'est à
 * l'appelant de répercuter le changement sur sa requête serveur ; ne pas le
 * brancher si l'API sous-jacente n'accepte pas de paramètre de tri (voir
 * `lib/api/records.ts` pour un exemple documenté de cette limite).
 */

import type { ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DataTablePagination {
  /** 0-based. */
  pageIndex: number;
  pageSize: number;
  /** Nombre total de lignes côté serveur — sert à calculer le nombre de pages. */
  total: number;
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  isLoading?: boolean;
  /** Message d'erreur à afficher — jamais confondu avec une liste vide. */
  error?: string | null;
  onRetry?: () => void;
  emptyState?: ReactNode;
  pagination?: DataTablePagination;
  onPageChange?: (pageIndex: number) => void;
  onRowClick?: (row: TData) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** Légende accessible et visible au-dessus du tableau (ex. "128 fiches"). */
  caption?: string;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  isLoading = false,
  error,
  onRetry,
  emptyState,
  pagination,
  onPageChange,
  onRowClick,
  sorting,
  onSortingChange,
  caption,
  className,
}: DataTableProps<TData>) {
  // TanStack Table's `useReactTable()` renvoie des fonctions qui ne peuvent pas
  // être mémoïsées de façon stable (nouvelle identité à chaque rendu) — le
  // compilateur React le détecte déjà et saute la mémoïsation de ce composant en
  // conséquence ; ce commentaire acquitte l'avertissement en connaissance de cause.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    manualPagination: true,
    manualSorting: true,
    state: sorting ? { sorting } : undefined,
    onSortingChange,
  });

  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;
  const currentPage = pagination ? pagination.pageIndex + 1 : 1;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {caption ? <p className="text-sm text-muted-foreground">{caption}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-40 whitespace-normal p-0">
                  <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                    <TriangleAlert className="size-6 text-destructive" />
                    <p className="text-sm font-medium text-foreground">Impossible de charger les données</p>
                    <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
                    {onRetry ? (
                      <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
                        Réessayer
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                // Lignes de patience sans identité propre — l'index comme clé est
                // sans risque ici (liste statique, jamais réordonnée/filtrée).
                <TableRow key={i} className="hover:bg-transparent">
                  {columns.map((column, colIndex) => (
                    <TableCell key={column.id ?? colIndex}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-40 whitespace-normal p-0">
                  {emptyState ?? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée.</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && !error && (data.length > 0 || pagination.pageIndex > 0) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {pagination.total} ligne{pagination.total !== 1 ? "s" : ""} · page {currentPage} / {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.pageIndex <= 0 || isLoading}
              onClick={() => onPageChange?.(pagination.pageIndex - 1)}
            >
              <ChevronLeft className="size-3.5" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount || isLoading}
              onClick={() => onPageChange?.(pagination.pageIndex + 1)}
            >
              Suivant
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
