# api-server/main.py
from fastapi import FastAPI, Depends, Header
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, engine, Base
from models import Item
import asyncio
from sqlalchemy import select

# Import experiment manager
from .utils.experiment_manager import get_variant

app = FastAPI()

@app.on_event("startup")
async def startup():
    # For simplicity, create tables on startup. Use Alembic for migrations in production.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Placeholder for memory service (will be replaced by actual TS integration)
class MemoryServicePlaceholder:
    async def search(self, query: str, variant: str = 'control'):
        print(f"MemoryServicePlaceholder: Searching for '{query}' using variant '{variant}'")
        # Simulate some async work
        await asyncio.sleep(0.1)
        return [{"id": 1, "content": f"Result from {variant} for {query}"}]

memory_service = MemoryServicePlaceholder()


@app.get("/items/")
async def read_items(db: AsyncSession = Depends(get_db)):
    items = await db.execute(select(Item))
    return items.scalars().all()

@app.post("/items/")
async def create_item(name: str, description: str = None, db: AsyncSession = Depends(get_db)):
    db_item = Item(name=name, description=description)
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item

@app.get("/search")
async def search_memory(
    query: str,
    x_user_id: Optional[str] = Header(None) # Assuming user ID from header
):
    user_id = x_user_id if x_user_id else "anonymous"
    variant = get_variant(user_id, "memory_algorithm_experiment")

    # Call memory service with the determined variant
    results = await memory_service.search(query, variant=variant)
    return {"results": results, "variant_used": variant}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
