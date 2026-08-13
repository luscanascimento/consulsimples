import { Module } from "@nestjs/common";
import { CategoryController } from "./category.controller";
import { CategoryRepository } from "./category.repository";
import { CategoryService } from "./category.service";
import { ProductController } from "./product.controller";
import { ProductRepository } from "./product.repository";
import { ProductService } from "./product.service";

@Module({
  controllers: [CategoryController, ProductController],
  providers: [CategoryRepository, CategoryService, ProductRepository, ProductService],
})
export class CatalogModule {}
