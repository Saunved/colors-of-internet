export interface DbGrid {
    id: string;
    grid_no: number;
    cells?: Cell[]
    created_at: string;
    size: number;
}

export interface Cell {
    id: number;
    status: boolean;
    pos: number;
    updated_at: string | null;
    created_at: string | null;
    version: number;
}