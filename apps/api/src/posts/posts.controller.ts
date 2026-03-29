import { Controller, Post, Body, Get, UseGuards, Request, Param } from '@nestjs/common';
import { PostsService } from './posts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('posts')
export class PostsController {
    constructor(private postsService: PostsService) { }

    @UseGuards(JwtAuthGuard)
    @Post()
    async createPost(@Request() req, @Body() data: any) {
        return this.postsService.createPost(req.user.userId, data);
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    async getPosts(@Request() req) {
        return this.postsService.getPosts(req.user.userId);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id')
    async getPost(@Param('id') id: string) {
        return this.postsService.getPostById(id);
    }
}
