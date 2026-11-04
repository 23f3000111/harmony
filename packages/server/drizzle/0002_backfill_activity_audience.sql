-- Activity written before audiences existed: money, orders, suppliers and requests become managers-only.
UPDATE "activity" SET "audience" = 'managers' WHERE "object_type" IN ('request', 'bill', 'expense', 'budget', 'order', 'supplier');
