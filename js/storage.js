/**
 * 本地存储管理模块
 * 使用 localStorage 存储用户数据、学习记录、家长设置等
 */

const Storage = {
  // 键名常量
  KEYS: {
    SETTINGS: 'study_helper_settings',
    STATS: 'study_helper_stats',
    PARENT_PASSWORD: 'study_helper_parent_password',
    DAILY_RECORD: 'study_helper_daily_record',
    CURRENT_DATE: 'study_helper_current_date'
  },

  // 默认设置
  defaultSettings: {
    dailyLimit: 60, // 分钟
    breakInterval: 20, // 分钟
    showReminder: true,
    voiceEnabled: true,
    dailyGoal: 20,
    startTime: null, // 当日开始时间
    totalTimeToday: 0, // 当日累计时长(秒)
    lastBreakTime: 0 // 上次休息提醒时间
  },

  // 默认统计
  defaultStats: {
    totalWordsLearned: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalStudyTime: 0, // 秒
    streakDays: 0,
    lastStudyDate: null,
    dailyCompleted: 0,
    history: [] // 最近7天记录 [{date, minutes}]
  },

  /**
   * 获取家长设置
   */
  getSettings() {
    const saved = localStorage.getItem(this.KEYS.SETTINGS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...this.defaultSettings, ...parsed };
    }
    return { ...this.defaultSettings };
  },

  /**
   * 保存家长设置
   */
  saveSettings(settings) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
  },

  /**
   * 获取学习统计
   */
  getStats() {
    const saved = localStorage.getItem(this.KEYS.STATS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...this.defaultStats, ...parsed };
    }
    return { ...this.defaultStats };
  },

  /**
   * 保存学习统计
   */
  saveStats(stats) {
    localStorage.setItem(this.KEYS.STATS, JSON.stringify(stats));
  },

  /**
   * 获取/设置家长密码
   */
  getParentPassword() {
    return localStorage.getItem(this.KEYS.PARENT_PASSWORD);
  },

  setParentPassword(password) {
    localStorage.setItem(this.KEYS.PARENT_PASSWORD, password);
  },

  /**
   * 清除所有数据
   */
  clearAllData() {
    Object.values(this.KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  },

  /**
   * 检查是否是新的一天，重置当日数据
   */
  checkNewDay() {
    const today = this.getTodayStr();
    const lastDate = localStorage.getItem(this.KEYS.CURRENT_DATE);
    
    if (lastDate !== today) {
      // 新的一天，重置当日数据
      const settings = this.getSettings();
      settings.totalTimeToday = 0;
      settings.startTime = null;
      settings.lastBreakTime = 0;
      this.saveSettings(settings);
      
      // 更新统计
      const stats = this.getStats();
      stats.dailyCompleted = 0;
      
      // 更新连续学习天数
      const yesterday = this.getYesterdayStr();
      if (stats.lastStudyDate === yesterday) {
        stats.streakDays = (stats.streakDays || 0) + 1;
      } else if (stats.lastStudyDate !== today) {
        stats.streakDays = 1;
      }
      stats.lastStudyDate = today;
      
      // 清理7天前的历史
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      const cutoffStr = this.formatDate(cutoffDate);
      stats.history = (stats.history || []).filter(h => h.date >= cutoffStr);
      
      this.saveStats(stats);
      localStorage.setItem(this.KEYS.CURRENT_DATE, today);
    }
  },

  /**
   * 记录学习时间
   */
  addStudyTime(seconds) {
    this.checkNewDay();
    const settings = this.getSettings();
    settings.totalTimeToday = (settings.totalTimeToday || 0) + seconds;
    this.saveSettings(settings);

    const stats = this.getStats();
    stats.totalStudyTime = (stats.totalStudyTime || 0) + seconds;
    
    // 更新今日历史
    const today = this.getTodayStr();
    const todayMinutes = Math.round((settings.totalTimeToday || 0) / 60);
    const existingHistory = stats.history.find(h => h.date === today);
    if (existingHistory) {
      existingHistory.minutes = todayMinutes;
    } else {
      stats.history = stats.history || [];
      stats.history.push({ date: today, minutes: todayMinutes });
    }
    
    this.saveStats(stats);
  },

  /**
   * 记录答题结果
   */
  recordAnswer(isCorrect) {
    const stats = this.getStats();
    if (isCorrect) {
      stats.totalCorrect = (stats.totalCorrect || 0) + 1;
      stats.dailyCompleted = (stats.dailyCompleted || 0) + 1;
    } else {
      stats.totalWrong = (stats.totalWrong || 0) + 1;
    }
    stats.totalWordsLearned = (stats.totalWordsLearned || 0) + 1;
    this.saveStats(stats);
  },

  /**
   * 获取今日已用时间（秒）
   */
  getTodayUsedTime() {
    this.checkNewDay();
    const settings = this.getSettings();
    return settings.totalTimeToday || 0;
  },

  /**
   * 获取今日剩余时间（秒）
   */
  getRemainingTime() {
    const settings = this.getSettings();
    const dailyLimit = settings.dailyLimit * 60; // 转为秒
    if (dailyLimit === 0) return Infinity; // 不限制
    
    const used = this.getTodayUsedTime();
    return Math.max(0, dailyLimit - used);
  },

  /**
   * 是否超过每日限制
   */
  isTimeUp() {
    const settings = this.getSettings();
    if (settings.dailyLimit === 0) return false;
    return this.getRemainingTime() <= 0;
  },

  // 辅助方法
  getTodayStr() {
    return this.formatDate(new Date());
  },

  getYesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return this.formatDate(d);
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
};
