# api-server/create_db.py
import asyncio
from database import engine, Base
from models import Item # Import your models here

async def create_db_and_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

if __name__ == "__main__":
    asyncio.run(create_db_and_tables())
