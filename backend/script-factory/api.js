/**
 * 剧本工厂 - REST API 路由
 * 提供剧本管理的完整 CRUD 接口
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import scriptDatabase from './database.js';
import scriptGenerator from './ScriptGenerator.js';

const router = express.Router();

// ==================== SSE 流式生成 ====================

/**
 * 流式生成剧本 (SSE)
 * GET /api/scripts/generate/stream
 */
router.get('/generate/stream', async (req, res) => {
  const { theme, playerCount, difficulty, title, customBackground } = req.query;

  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const taskId = uuidv4().substring(0, 8);
  
  // 发送 SSE 消息
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 监听生成进度
  const progressHandler = (event) => {
    sendEvent(event);
  };

  // 添加监听器
  scriptGenerator.on('progress', progressHandler);

  try {
    sendEvent({ type: 'start', taskId });

    const result = await scriptGenerator.generateScript({
      theme: theme || 'mansion_murder',
      playerCount: parseInt(playerCount) || 4,
      difficulty: parseInt(difficulty) || 3,
      title: title || null,
      customBackground: customBackground || null
    });

    if (result.success) {
      const script = await scriptDatabase.getFullScript(result.scriptId);
      sendEvent({
        type: 'complete',
        scriptId: result.scriptId,
        title: script.title,
        validation: result.validation
      });
    }

  } catch (error) {
    console.error('[剧本API] 流式生成失败:', error);
    sendEvent({ type: 'error', message: error.message });
  } finally {
    // 移除监听器
    scriptGenerator.off('progress', progressHandler);
    res.end();
  }
});

// ==================== 剧本生成 ====================

/**
 * 一键生成剧本
 * POST /api/scripts/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { theme, playerCount, difficulty, title, customBackground } = req.body;

    // 参数验证
    if (playerCount && (playerCount < 3 || playerCount > 8)) {
      return res.status(400).json({ 
        error: '玩家数量必须在3-8之间' 
      });
    }
    if (difficulty && (difficulty < 1 || difficulty > 5)) {
      return res.status(400).json({ 
        error: '难度必须在1-5之间' 
      });
    }

    console.log('[剧本API] 开始生成剧本:', { theme, playerCount, difficulty });

    const result = await scriptGenerator.generateScript({
      theme: theme || 'mansion_murder',
      playerCount: playerCount || 4,
      difficulty: difficulty || 3,
      title,
      customBackground
    });

    if (result.success) {
      const script = await scriptDatabase.getFullScript(result.scriptId);
      res.json({
        success: true,
        message: '剧本生成成功',
        script,
        validation: result.validation
      });
    } else {
      res.status(500).json({
        success: false,
        error: '剧本生成失败'
      });
    }
  } catch (error) {
    console.error('[剧本API] 生成失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取可用主题列表
 * GET /api/scripts/themes
 */
router.get('/themes', (req, res) => {
  const themes = scriptGenerator.getAvailableThemes();
  res.json({ themes });
});

// ==================== 剧本 CRUD ====================

/**
 * 获取剧本列表
 * GET /api/scripts
 */
router.get('/', async (req, res) => {
  try {
    const { status, theme, published, limit, offset } = req.query;
    
    const scripts = await scriptDatabase.getScripts({
      status,
      theme,
      isPublished: published === 'true' ? true : published === 'false' ? false : undefined,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      count: scripts.length,
      scripts
    });
  } catch (error) {
    console.error('[剧本API] 获取列表失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取已发布的剧本（用于游戏选择）
 * GET /api/scripts/published
 */
router.get('/published', async (req, res) => {
  try {
    const { theme, minPlayers, maxPlayers, difficulty, limit } = req.query;
    
    const scripts = await scriptDatabase.getPublishedScripts({
      theme,
      minPlayers: parseInt(minPlayers) || undefined,
      maxPlayers: parseInt(maxPlayers) || undefined,
      difficulty: parseInt(difficulty) || undefined,
      limit: parseInt(limit) || 20
    });

    res.json({
      success: true,
      count: scripts.length,
      scripts
    });
  } catch (error) {
    console.error('[剧本API] 获取已发布列表失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取剧本详情
 * GET /api/scripts/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { full } = req.query;

    let script;
    if (full === 'true') {
      script = await scriptDatabase.getFullScript(id);
    } else {
      script = await scriptDatabase.getScript(id);
    }

    if (!script) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    res.json({
      success: true,
      script
    });
  } catch (error) {
    console.error('[剧本API] 获取详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新剧本
 * PUT /api/scripts/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await scriptDatabase.getScript(id);
    if (!existing) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    const script = await scriptDatabase.updateScript(id, updates);
    res.json({
      success: true,
      message: '更新成功',
      script
    });
  } catch (error) {
    console.error('[剧本API] 更新失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除剧本
 * DELETE /api/scripts/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await scriptDatabase.getScript(id);
    if (!existing) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    await scriptDatabase.deleteScript(id);
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('[剧本API] 删除失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 发布剧本
 * POST /api/scripts/:id/publish
 */
router.post('/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await scriptDatabase.getScript(id);
    if (!existing) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    // 发布前验证
    const validation = await scriptGenerator.validateScript(id);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: '剧本验证失败，无法发布',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    const script = await scriptDatabase.publishScript(id);
    res.json({
      success: true,
      message: '发布成功',
      script
    });
  } catch (error) {
    console.error('[剧本API] 发布失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 验证剧本
 * POST /api/scripts/:id/validate
 */
router.post('/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await scriptDatabase.getScript(id);
    if (!existing) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    const validation = await scriptGenerator.validateScript(id);
    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('[剧本API] 验证失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 导出剧本（完整JSON）
 * GET /api/scripts/:id/export
 */
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;

    const script = await scriptDatabase.getFullScript(id);
    if (!script) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${script.title || 'script'}.json"`);
    res.json(script);
  } catch (error) {
    console.error('[剧本API] 导出失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 记录剧本使用
 * POST /api/scripts/:id/use
 */
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;
    const { roomId } = req.body;

    await scriptDatabase.logScriptUsage(id, roomId);
    res.json({
      success: true,
      message: '使用记录已保存'
    });
  } catch (error) {
    console.error('[剧本API] 记录使用失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 评价剧本
 * POST /api/scripts/:id/rate
 */
router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: '评分必须在1-5之间' });
    }

    await scriptDatabase.rateScript(id, rating, feedback);
    const script = await scriptDatabase.getScript(id);
    
    res.json({
      success: true,
      message: '评价成功',
      newRating: script.rating,
      ratingCount: script.rating_count
    });
  } catch (error) {
    console.error('[剧本API] 评价失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 角色管理 ====================

/**
 * 获取剧本角色列表
 * GET /api/scripts/:id/characters
 */
router.get('/:id/characters', async (req, res) => {
  try {
    const { id } = req.params;
    const characters = await scriptDatabase.getScriptCharacters(id);
    res.json({
      success: true,
      count: characters.length,
      characters
    });
  } catch (error) {
    console.error('[剧本API] 获取角色失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 章节管理 ====================

/**
 * 获取剧本章节列表
 * GET /api/scripts/:id/chapters
 */
router.get('/:id/chapters', async (req, res) => {
  try {
    const { id } = req.params;
    const chapters = await scriptDatabase.getScriptChapters(id);
    
    // 获取每章的谜题
    const chaptersWithPuzzles = await Promise.all(
      chapters.map(async (chapter) => {
        const puzzles = await scriptDatabase.getChapterPuzzles(chapter.id);
        return { ...chapter, puzzles };
      })
    );

    res.json({
      success: true,
      count: chapters.length,
      chapters: chaptersWithPuzzles
    });
  } catch (error) {
    console.error('[剧本API] 获取章节失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 线索管理 ====================

/**
 * 获取剧本线索列表
 * GET /api/scripts/:id/clues
 */
router.get('/:id/clues', async (req, res) => {
  try {
    const { id } = req.params;
    const { chapterId } = req.query;
    
    const clues = await scriptDatabase.getScriptClues(id, chapterId);
    res.json({
      success: true,
      count: clues.length,
      clues
    });
  } catch (error) {
    console.error('[剧本API] 获取线索失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 地点管理 ====================

/**
 * 获取剧本地点列表
 * GET /api/scripts/:id/locations
 */
router.get('/:id/locations', async (req, res) => {
  try {
    const { id } = req.params;
    const locations = await scriptDatabase.getScriptLocations(id);
    res.json({
      success: true,
      count: locations.length,
      locations
    });
  } catch (error) {
    console.error('[剧本API] 获取地点失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 关系管理 ====================

/**
 * 获取人物关系图
 * GET /api/scripts/:id/relationships
 */
router.get('/:id/relationships', async (req, res) => {
  try {
    const { id } = req.params;
    const relationships = await scriptDatabase.getScriptRelationships(id);
    res.json({
      success: true,
      count: relationships.length,
      relationships
    });
  } catch (error) {
    console.error('[剧本API] 获取关系失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 统计信息 ====================

/**
 * 获取剧本工厂统计信息
 * GET /api/scripts/stats/overview
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const allScripts = await scriptDatabase.getScripts({ limit: 1000 });
    const publishedScripts = allScripts.filter(s => s.is_published);
    
    const stats = {
      totalScripts: allScripts.length,
      publishedScripts: publishedScripts.length,
      draftScripts: allScripts.filter(s => s.status === 'draft').length,
      totalPlayCount: allScripts.reduce((sum, s) => sum + (s.play_count || 0), 0),
      averageRating: publishedScripts.length > 0 
        ? publishedScripts.reduce((sum, s) => sum + (s.rating || 0), 0) / publishedScripts.length 
        : 0,
      themeDistribution: {},
      difficultyDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };

    // 统计主题分布
    for (const script of allScripts) {
      stats.themeDistribution[script.theme] = (stats.themeDistribution[script.theme] || 0) + 1;
      if (script.difficulty >= 1 && script.difficulty <= 5) {
        stats.difficultyDistribution[script.difficulty]++;
      }
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[剧本API] 获取统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
