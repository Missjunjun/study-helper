/**
 * 学习小助手 - 主应用逻辑
 * 英语单词默写、语文生字默写、课文默写、家长控制等功能
 */

// 应用状态
const App = {
  // 数据缓存
  englishData: null,
  chineseData: null,
  
  // 当前状态
  state: {
    currentPage: 'home',
    subject: null, // 'english' | 'chinese'
    gradeKey: null,
    gradeName: null,
    practiceMode: null,
    wordList: [],
    currentIndex: 0,
    results: [],
    selectedAnswer: null,
    timeInterval: null,
    studyInterval: null,
    breakIntervalTimer: null,
    isPaused: false
  },

  /**
   * 初始化应用
   */
  async init() {
    // 检查家长密码是否设置
    const hasPassword = !!Storage.getParentPassword();
    
    // 检查是否超过时间限制
    Storage.checkNewDay();
    
    // 加载数据：优先使用内嵌数据（离线版单文件），否则请求本地JSON文件
    try {
      if (window.__ENGLISH_DATA__ && window.__CHINESE_DATA__) {
        this.englishData = window.__ENGLISH_DATA__;
        this.chineseData = window.__CHINESE_DATA__;
      } else {
        const [english, chinese] = await Promise.all([
          fetch('data/english.json').then(r => r.json()),
          fetch('data/chinese.json').then(r => r.json())
        ]);
        this.englishData = english;
        this.chineseData = chinese;
      }
    } catch (e) {
      console.error('数据加载失败:', e);
    }

    // 显示启动画面，然后进入主界面
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      splash.classList.add('fade-out');
      setTimeout(() => {
        splash.classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        
        // 如果没有设置密码，引导设置
        if (!hasPassword) {
          setTimeout(() => this.openSetPasswordModal(), 300);
        }
        
        this.updateHomePage();
        this.startTimeTracking();
      }, 500);
    }, 2000);

    // 注册 Service Worker（PWA支持，仅在 http/https 环境下生效）
    const isWebContext = location.protocol === 'http:' || location.protocol === 'https:';
    if (isWebContext && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(console.error);
      });
    }

    // 注册可见性变化事件
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseTracking();
      } else {
        this.resumeTracking();
      }
    });
  },

  /**
   * 时间追踪
   */
  startTimeTracking() {
    const settings = Storage.getSettings();
    
    // 已用完时间检查
    if (Storage.isTimeUp()) {
      this.showTimeUpModal();
      return;
    }

    // 更新时间显示
    this.updateTimerDisplay();

    // 每秒更新显示
    this.state.timeInterval = setInterval(() => {
      this.updateTimerDisplay();
      
      if (Storage.isTimeUp()) {
        this.showTimeUpModal();
        this.pauseTracking();
      }
    }, 1000);

    // 每30秒记录学习时间
    this.state.studyInterval = setInterval(() => {
      Storage.addStudyTime(30);
      this.checkBreakReminder();
      this.updateHomePage();
    }, 30000);
  },

  pauseTracking() {
    this.state.isPaused = true;
  },

  resumeTracking() {
    if (this.state.isPaused) {
      this.state.isPaused = false;
    }
  },

  updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    const remaining = Storage.getRemainingTime();
    const settings = Storage.getSettings();
    
    if (settings.dailyLimit === 0) {
      display.innerHTML = '<span class="timer-icon">⏱️</span><span>无限制</span>';
      return;
    }

    if (remaining === Infinity || remaining < 0) {
      display.innerHTML = '<span class="timer-icon">⏰</span><span>已用完</span>';
      return;
    }

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
    
    // 时间少时变红
    if (remaining < 300) {
      display.style.color = '#FFE0E0';
    }
    display.innerHTML = `<span class="timer-icon">⏱️</span><span>${timeStr}</span>`;
  },

  checkBreakReminder() {
    const settings = Storage.getSettings();
    const used = Storage.getTodayUsedTime();
    const intervalSec = settings.breakInterval * 60;
    
    // 每到休息间隔提醒
    const shouldRemind = Math.floor(used / intervalSec) > 
                         Math.floor((used - 30) / intervalSec);
    
    if (shouldRemind && used > 0) {
      this.showBreakReminder();
    }
  },

  showBreakReminder() {
    const modal = document.getElementById('break-modal');
    modal.classList.remove('hidden');
    
    // 30秒倒计时
    let seconds = 30;
    const display = document.getElementById('break-timer-display');
    const timer = setInterval(() => {
      seconds--;
      display.textContent = `00:${String(seconds).padStart(2, '0')}`;
      if (seconds <= 0) {
        clearInterval(timer);
        this.skipBreak();
      }
    }, 1000);
    
    modal.dataset.timer = timer;
  },

  skipBreak() {
    const modal = document.getElementById('break-modal');
    const timer = modal.dataset.timer;
    if (timer) clearInterval(timer);
    modal.classList.add('hidden');
  },

  showTimeUpModal() {
    document.getElementById('time-up-modal').classList.remove('hidden');
  },

  closeTimeUpModal() {
    document.getElementById('time-up-modal').classList.add('hidden');
    this.navigateTo('home');
  },

  /**
   * 更新首页
   */
  updateHomePage() {
    const stats = Storage.getStats();
    const settings = Storage.getSettings();
    const greeting = this.getGreeting();
    
    document.getElementById('greeting-text').textContent = greeting;
    document.getElementById('streak-count').textContent = stats.streakDays || 0;
    document.getElementById('total-words').textContent = stats.totalWordsLearned || 0;
    document.getElementById('total-correct').textContent = stats.totalCorrect || 0;
    document.getElementById('total-time').textContent = 
      Math.round((stats.totalStudyTime || 0) / 60) + '分钟';
    
    // 更新目标进度
    const completed = stats.dailyCompleted || 0;
    const goal = settings.dailyGoal || 20;
    const percent = Math.min(100, (completed / goal) * 100);
    document.getElementById('goal-progress').textContent = `${completed} / ${goal}`;
    document.getElementById('goal-fill').style.width = percent + '%';
  },

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了，早点休息哦！';
    if (hour < 12) return '早上好，小朋友！';
    if (hour < 14) return '中午好，吃饱饱才有力气学习！';
    if (hour < 18) return '下午好，继续加油！';
    if (hour < 22) return '晚上好，今天学习了吗？';
    return '时间不早啦，准备休息吧~';
  },

  /**
   * 页面导航
   */
  navigateTo(page) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    
    // 显示目标页面
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) {
      pageEl.classList.remove('hidden');
    }

    // 更新导航栏
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    event?.currentTarget?.classList?.add('active') || 
      document.querySelector(`.nav-item[onclick*="${page}"]`)?.classList.add('active');

    // 返回按钮
    const backBtn = document.getElementById('back-btn');
    const title = document.getElementById('page-title');
    
    if (page === 'home') {
      backBtn.style.display = 'none';
      title.textContent = '学习小助手';
      this.updateHomePage();
    } else if (page === 'subject') {
      backBtn.style.display = 'flex';
      title.textContent = this.state.subject === 'english' ? '英语学习' : 
                         (this.state.subject === 'chinese' ? '语文学习' : '选择学习');
      this.showGradeSelect();
    } else if (page === 'parent') {
      backBtn.style.display = 'flex';
      title.textContent = '家长控制';
      this.loadParentSettings();
    } else if (page === 'practice') {
      title.textContent = '练习中';
    } else if (page === 'result') {
      title.textContent = '练习结果';
    }

    this.state.currentPage = page;
    window.scrollTo(0, 0);
  },

  goBack() {
    if (this.state.currentPage === 'subject' && this.state.practiceMode) {
      // 从模式选择返回年级选择
      document.getElementById('mode-select').classList.add('hidden');
      this.state.practiceMode = null;
    } else if (this.state.currentPage === 'subject') {
      this.navigateTo('home');
    } else {
      this.navigateTo('home');
    }
  },

  goHome() {
    this.navigateTo('home');
  },

  /**
   * 选择科目
   */
  selectSubject(subject) {
    // 检查时间
    if (Storage.isTimeUp()) {
      this.showTimeUpModal();
      return;
    }
    
    this.state.subject = subject;
    this.navigateTo('subject');
  },

  /**
   * 显示年级选择
   */
  showGradeSelect() {
    const data = this.state.subject === 'english' ? this.englishData : this.chineseData;
    const grades = data?.grades || {};
    const gradeGrid = document.getElementById('grade-grid');
    
    gradeGrid.innerHTML = '';
    
    Object.entries(grades).forEach(([key, grade]) => {
      const card = document.createElement('div');
      card.className = 'grade-card';
      card.innerHTML = `
        <div class="grade-number">${grade.name}</div>
        <div class="grade-label">${grade.words.length}个单词${grade.texts ? ' · ' + grade.texts.length + '篇课文' : ''}</div>
      `;
      card.onclick = () => this.selectGrade(key, grade.name);
      gradeGrid.appendChild(card);
    });

    document.getElementById('mode-select').classList.add('hidden');
  },

  selectGrade(key, name) {
    this.state.gradeKey = key;
    this.state.gradeName = name;
    
    // 显示模式选择
    const data = this.state.subject === 'english' ? this.englishData : this.chineseData;
    const hasTexts = data?.grades?.[key]?.texts?.length > 0;
    document.getElementById('text-dictation-card').style.display = hasTexts ? '' : 'none';
    
    document.getElementById('mode-select').classList.remove('hidden');
    
    // 高亮选中的年级
    document.querySelectorAll('.grade-card').forEach((card, idx) => {
      card.classList.toggle('selected', 
        Object.keys(data?.grades || {})[idx] === key);
    });
  },

  /**
   * 开始练习
   */
  startPractice(mode) {
    this.state.practiceMode = mode;
    const data = this.state.subject === 'english' ? this.englishData : this.chineseData;
    const grade = data?.grades?.[this.state.gradeKey];
    
    if (!grade) return;

    // 根据模式准备题目
    if (mode === 'text-dictation' && grade.texts) {
      // 课文默写模式
      this.state.wordList = this.prepareTextQuestions(grade.texts);
    } else {
      // 单词模式
      this.state.wordList = [...grade.words];
      // 随机打乱
      this.shuffleArray(this.state.wordList);
      // 限制10个
      this.state.wordList = this.state.wordList.slice(0, 10);
    }
    
    this.state.currentIndex = 0;
    this.state.results = [];
    this.state.selectedAnswer = null;
    
    // 跳转到练习页
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-practice').classList.remove('hidden');
    document.getElementById('page-title').textContent = this.state.gradeName + ' - ' + this.getModeName(mode);
    
    this.renderQuestion();
  },

  getModeName(mode) {
    const names = {
      'word-dictation': '单词默写',
      'word-practice': '单词练习',
      'text-dictation': '课文默写'
    };
    return names[mode] || mode;
  },

  prepareTextQuestions(texts) {
    // 随机选择一篇课文，挖空几个词
    const text = texts[Math.floor(Math.random() * texts.length)];
    const words = text.content.split(/[，。！？、\s]/).filter(w => w.length >= 2);
    
    // 选5-8个词挖空
    const blankCount = Math.min(6, words.length);
    const shuffled = this.shuffleArray([...words]);
    const blanks = shuffled.slice(0, blankCount);
    
    return [{
      type: 'text',
      title: text.title,
      content: text.content,
      blanks: blanks,
      totalBlanks: blankCount
    }];
  },

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  /**
   * 渲染当前题目
   */
  renderQuestion() {
    const list = this.state.wordList;
    const idx = this.state.currentIndex;
    
    document.getElementById('current-index').textContent = idx + 1;
    document.getElementById('total-count').textContent = list.length;
    document.getElementById('correct-count').textContent = 
      this.state.results.filter(r => r.correct).length;
    document.getElementById('wrong-count').textContent = 
      this.state.results.filter(r => !r.correct).length;

    const card = document.getElementById('practice-card');
    const inputArea = document.getElementById('practice-input-area');
    const mode = this.state.practiceMode;
    const isEnglish = this.state.subject === 'english';

    this.state.selectedAnswer = null;

    if (mode === 'text-dictation') {
      this.renderTextDictation(card, inputArea);
      return;
    }

    const word = list[idx];
    
    if (mode === 'word-dictation') {
      // 默写模式：显示中文/释义，输入英文/中文
      if (isEnglish) {
        // 英语：显示中文，写英文
        card.innerHTML = `
          <div class="practice-hint">请根据中文意思写出英文单词</div>
          <div class="practice-question">${word.meaning}</div>
          <div class="practice-phonetic">${word.phonetic || ''}</div>
          <button class="speaker-btn" onclick="App.speak('${word.word}')">🔊 听发音</button>
        `;
        inputArea.innerHTML = `<input type="text" class="answer-input" id="answer-input" placeholder="输入英文单词" autocomplete="off" autocapitalize="off">`;
      } else {
        // 语文：显示拼音，写汉字
        card.innerHTML = `
          <div class="practice-hint">请根据拼音写出汉字</div>
          <div class="practice-question pinyin">${word.pinyin}</div>
          <div class="practice-phonetic">${word.meaning}</div>
        `;
        inputArea.innerHTML = `<input type="text" class="answer-input" id="answer-input" placeholder="输入汉字" autocomplete="off">`;
      }
    } else if (mode === 'word-practice') {
      // 练习模式：选择题
      if (isEnglish) {
        card.innerHTML = `
          <div class="practice-hint">选择正确的中文意思</div>
          <div class="practice-question">${word.word}</div>
          <div class="practice-phonetic">${word.phonetic || ''}</div>
          <button class="speaker-btn" onclick="App.speak('${word.word}')">🔊 听发音</button>
        `;
        
        // 生成选项（正确答案 + 3个错误答案）
        const wrongOptions = this.getWrongOptions(idx, 'meaning', 3);
        const options = this.shuffleArray([word.meaning, ...wrongOptions]);
        
        inputArea.innerHTML = `
          <div class="choice-grid">
            ${options.map((opt, i) => `
              <button class="choice-btn" data-value="${opt}" onclick="App.selectChoice(this)">${String.fromCharCode(65 + i)}. ${opt}</button>
            `).join('')}
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="practice-hint">选择正确的拼音</div>
          <div class="practice-question">${word.word}</div>
        `;
        
        const wrongOptions = this.getWrongOptions(idx, 'pinyin', 3);
        const options = this.shuffleArray([word.pinyin, ...wrongOptions]);
        
        inputArea.innerHTML = `
          <div class="choice-grid">
            ${options.map((opt, i) => `
              <button class="choice-btn" data-value="${opt}" onclick="App.selectChoice(this)">${String.fromCharCode(65 + i)}. ${opt}</button>
            `).join('')}
          </div>
        `;
      }
    }

    // 自动聚焦输入框
    setTimeout(() => {
      const input = document.getElementById('answer-input');
      if (input) input.focus();
    }, 100);
  },

  renderTextDictation(card, inputArea) {
    const textItem = this.state.wordList[0];
    const content = textItem.content;
    const blanks = textItem.blanks;
    
    // 创建挖空版本
    let blankIndex = 0;
    let renderedContent = content;
    const blankMap = {};
    
    blanks.forEach((blank, idx) => {
      if (!blankMap[blank]) {
        // 替换第一次出现的该词
        renderedContent = renderedContent.replace(
          new RegExp(blank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          `{{BLANK_${idx}}}`
        );
        blankMap[blank] = idx;
      }
    });

    // 分割内容为段落
    const parts = renderedContent.split(/(\{\{BLANK_\d+\}\})/);
    
    card.innerHTML = `
      <div class="practice-hint">根据记忆补充课文中缺失的词语</div>
      <div style="font-size:14px;color:#999;margin-bottom:12px;">${textItem.title}</div>
      <div class="text-content" id="text-content">
        ${parts.map(part => {
          const match = part.match(/\{\{BLANK_(\d+)\}\}/);
          if (match) {
            const idx = match[1];
            return `<span class="text-blank" data-blank="${idx}" contenteditable="true" 
              oninput="App.onBlankInput(this)" 
              onkeydown="App.handleBlankKey(event, this)">&nbsp;</span>`;
          }
          return part;
        }).join('')}
      </div>
    `;
    
    inputArea.innerHTML = `<div style="font-size:13px;color:#999;padding:8px;">💡 点击空格处，输入课文中的词语</div>`;
    
    // 存储正确答案映射
    this.state.textBlanks = blanks;
  },

  onBlankInput(el) {
    el.classList.remove('filled', 'wrong');
  },

  handleBlankKey(event, el) {
    if (event.key === 'Enter') {
      event.preventDefault();
      // 跳到下一个空格
      const blanks = document.querySelectorAll('.text-blank');
      const currentIdx = Array.from(blanks).indexOf(el);
      if (currentIdx < blanks.length - 1) {
        blanks[currentIdx + 1].focus();
      }
    }
  },

  getWrongOptions(currentIdx, field, count) {
    const data = this.state.subject === 'english' ? this.englishData : this.chineseData;
    const grade = data.grades[this.state.gradeKey];
    const currentWord = grade.words[currentIdx];
    
    // 从同年级其他词中选错误选项
    const others = grade.words.filter((_, i) => i !== currentIdx);
    const shuffled = this.shuffleArray([...others]);
    const wrongs = shuffled.slice(0, count).map(w => w[field]);
    
    // 确保不重复
    const seen = new Set([currentWord[field]]);
    return wrongs.filter(w => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    }).slice(0, count);
  },

  selectChoice(btn) {
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    this.state.selectedAnswer = btn.dataset.value;
  },

  /**
   * 语音朗读
   */
  speak(text) {
    const settings = Storage.getSettings();
    if (!settings.voiceEnabled) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.state.subject === 'english' ? 'en-US' : 'zh-CN';
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  },

  /**
   * 提交答案
   */
  submitAnswer() {
    const mode = this.state.practiceMode;
    
    if (mode === 'text-dictation') {
      this.submitTextDictation();
      return;
    }

    const list = this.state.wordList;
    const idx = this.state.currentIndex;
    const word = list[idx];
    const isEnglish = this.state.subject === 'english';
    
    let userAnswer, correctAnswer;
    
    if (mode === 'word-dictation') {
      const input = document.getElementById('answer-input');
      if (!input) return;
      userAnswer = input.value.trim().toLowerCase();
      correctAnswer = isEnglish ? word.word.toLowerCase() : word.word;
      
      if (!userAnswer) {
        this.showToast('请输入答案哦~');
        input.focus();
        return;
      }
    } else if (mode === 'word-practice') {
      if (!this.state.selectedAnswer) {
        this.showToast('请选择一个选项~');
        return;
      }
      userAnswer = this.state.selectedAnswer;
      correctAnswer = isEnglish ? word.meaning : word.pinyin;
    }

    const isCorrect = userAnswer === correctAnswer;
    
    // 记录结果
    this.state.results.push({
      word: word.word,
      correctAnswer: isEnglish ? word.word : word.word,
      userAnswer: userAnswer,
      isCorrect: isCorrect,
      mode: mode
    });
    
    Storage.recordAnswer(isCorrect);

    // 显示反馈
    this.showFeedback(isCorrect, correctAnswer, userAnswer);
  },

  submitTextDictation() {
    const blanks = document.querySelectorAll('.text-blank');
    const correctAnswers = this.state.textBlanks;
    
    let correctCount = 0;
    const results = [];
    
    blanks.forEach((blankEl, i) => {
      const userAnswer = blankEl.textContent.trim();
      const correctAnswer = correctAnswers[i];
      const isCorrect = userAnswer === correctAnswer;
      
      results.push({
        blankIndex: i,
        userAnswer: userAnswer,
        correctAnswer: correctAnswer,
        isCorrect: isCorrect
      });
      
      if (isCorrect) {
        blankEl.classList.add('filled');
        correctCount++;
      } else {
        blankEl.classList.add('wrong');
        blankEl.textContent = correctAnswer;
        blankEl.style.textDecoration = 'underline';
      }
    });

    // 记录统计
    results.forEach(r => Storage.recordAnswer(r.isCorrect));

    setTimeout(() => {
      this.state.results = [{
        word: '课文填空',
        correctAnswer: `${correctCount}/${correctAnswers.length}`,
        userAnswer: `${correctAnswers.length - correctCount}处错误`,
        isCorrect: correctCount === correctAnswers.length,
        detail: results,
        mode: 'text-dictation',
        total: correctAnswers.length,
        correct: correctCount
      }];
      this.showResultPage();
    }, 1500);
  },

  showFeedback(isCorrect, correctAnswer, userAnswer) {
    const card = document.getElementById('practice-card');
    
    // 高亮正确/错误
    if (this.state.practiceMode === 'word-practice') {
      document.querySelectorAll('.choice-btn').forEach(btn => {
        if (btn.dataset.value === correctAnswer) {
          btn.classList.add('correct');
        } else if (btn.dataset.value === userAnswer && userAnswer !== correctAnswer) {
          btn.classList.add('wrong');
        }
      });
    } else {
      const input = document.getElementById('answer-input');
      if (input) {
        input.classList.add(isCorrect ? 'correct' : 'wrong');
        input.disabled = true;
      }
    }

    // 显示反馈文字
    const feedbackDiv = document.createElement('div');
    if (isCorrect) {
      feedbackDiv.className = 'feedback-correct';
      feedbackDiv.textContent = '🎉 回答正确！';
    } else {
      feedbackDiv.className = 'feedback-wrong';
      feedbackDiv.innerHTML = `❌ 正确答案是：<strong>${correctAnswer}</strong>`;
    }
    card.appendChild(feedbackDiv);

    // 延迟后进入下一题或显示结果
    setTimeout(() => {
      this.state.currentIndex++;
      if (this.state.currentIndex >= this.state.wordList.length) {
        this.showResultPage();
      } else {
        this.renderQuestion();
      }
    }, 1500);
  },

  /**
   * 显示结果页
   */
  showResultPage() {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-result').classList.remove('hidden');
    
    const correct = this.state.results.filter(r => r.isCorrect).length;
    const total = this.state.results.length;
    const wrong = total - correct;
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

    // 设置emoji和标题
    let emoji, title;
    if (rate === 100) {
      emoji = '🏆'; title = '太棒了！全部正确！';
    } else if (rate >= 80) {
      emoji = '🎉'; title = '非常不错！继续加油！';
    } else if (rate >= 60) {
      emoji = '💪'; title = '还可以，再接再厉！';
    } else {
      emoji = '📚'; title = '别灰心，多练习几次！';
    }

    document.getElementById('result-emoji').textContent = emoji;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-correct').textContent = correct;
    document.getElementById('result-wrong').textContent = wrong;
    document.getElementById('result-rate').textContent = rate + '%';

    // 生成详细列表
    const list = document.getElementById('result-list');
    list.innerHTML = '';
    
    this.state.results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'result-item';
      
      if (r.mode === 'text-dictation') {
        // 课文默写特殊展示
        const detail = r.detail.map(d => 
          `<div style="margin:4px 0;">${d.isCorrect ? '✓' : '✗'} ${d.correctAnswer} ${d.isCorrect ? '' : `(你填的: ${d.userAnswer || '空'})`}</div>`
        ).join('');
        item.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:500;">${r.word}</div>
            <div style="font-size:12px;color:#999;margin-top:4px;">${detail}</div>
          </div>
          <div class="result-status">${r.isCorrect ? '🎉' : '📖'}</div>
        `;
      } else {
        item.innerHTML = `
          <div class="question">${r.word}</div>
          <div class="answers">
            ${!r.isCorrect ? `<div class="user-answer">你的: ${r.userAnswer}</div>` : ''}
            <div class="correct-answer">${r.isCorrect ? '✓ 正确' : '✗ 错了'}</div>
          </div>
          <div class="status">${r.isCorrect ? '🎉' : '💪'}</div>
        `;
      }
      
      list.appendChild(item);
    });
  },

  restartPractice() {
    this.startPractice(this.state.practiceMode);
  },

  /**
   * 家长面板
   */
  openParentPanel() {
    // 验证家长密码
    const password = Storage.getParentPassword();
    
    if (!password) {
      // 没有设置密码，直接进入设置面板
      this.navigateTo('parent');
      return;
    }
    
    // 显示密码弹窗
    document.getElementById('parent-password').value = '';
    document.getElementById('parent-modal').classList.remove('hidden');
  },

  closeParentModal() {
    document.getElementById('parent-modal').classList.add('hidden');
  },

  verifyParent() {
    const input = document.getElementById('parent-password').value;
    const stored = Storage.getParentPassword();
    const hint = document.getElementById('password-hint');
    
    if (!stored) {
      // 默认密码123456
      if (input === '123456') {
        this.closeParentModal();
        this.navigateTo('parent');
      } else {
        hint.textContent = '密码错误，默认密码是 123456';
      }
    } else if (input === stored) {
      this.closeParentModal();
      this.navigateTo('parent');
    } else {
      hint.textContent = '密码错误，请重试';
    }
  },

  openSetPasswordModal() {
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    document.getElementById('set-password-hint').textContent = '';
    document.getElementById('set-password-modal').classList.remove('hidden');
  },

  closeSetPasswordModal() {
    document.getElementById('set-password-modal').classList.add('hidden');
  },

  setParentPassword() {
    const pwd1 = document.getElementById('new-password').value;
    const pwd2 = document.getElementById('confirm-password').value;
    const hint = document.getElementById('set-password-hint');
    
    if (!pwd1 || pwd1.length < 6) {
      hint.textContent = '密码至少6位';
      return;
    }
    if (!/^\d+$/.test(pwd1)) {
      hint.textContent = '密码只能包含数字';
      return;
    }
    if (pwd1 !== pwd2) {
      hint.textContent = '两次密码不一致';
      return;
    }
    
    Storage.setParentPassword(pwd1);
    this.closeSetPasswordModal();
    this.showToast('✓ 密码设置成功');
  },

  loadParentSettings() {
    const settings = Storage.getSettings();
    const stats = Storage.getStats();
    
    document.getElementById('daily-limit').value = settings.dailyLimit;
    document.getElementById('break-interval').value = settings.breakInterval;
    document.getElementById('show-reminder').checked = settings.showReminder;
    document.getElementById('voice-enabled').checked = settings.voiceEnabled;
    
    // 渲染周学习图表
    this.renderWeeklyChart(stats.history);
  },

  renderWeeklyChart(history) {
    const chart = document.getElementById('weekly-chart');
    chart.innerHTML = '';
    
    // 获取最近7天
    const days = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = Storage.formatDate(d);
      const dayName = ['日','一','二','三','四','五','六'][d.getDay()];
      
      const record = history?.find(h => h.date === dateStr);
      days.push({
        label: dayName,
        minutes: record?.minutes || 0
      });
    }
    
    const maxMin = Math.max(...days.map(d => d.minutes), 30);
    
    days.forEach(day => {
      const height = maxMin > 0 ? (day.minutes / maxMin) * 100 : 0;
      const item = document.createElement('div');
      item.className = 'bar-item';
      item.innerHTML = `
        <div class="bar-label" style="font-size:10px;color:#666;">${day.minutes}分</div>
        <div class="bar" style="height:${height}%"></div>
        <div class="bar-label">${day.label}</div>
      `;
      chart.appendChild(item);
    });
  },

  saveParentSettings() {
    const settings = Storage.getSettings();
    
    settings.dailyLimit = parseInt(document.getElementById('daily-limit').value);
    settings.breakInterval = parseInt(document.getElementById('break-interval').value);
    settings.showReminder = document.getElementById('show-reminder').checked;
    settings.voiceEnabled = document.getElementById('voice-enabled').checked;
    
    Storage.saveSettings(settings);
    
    // 检查时间限制
    if (Storage.isTimeUp()) {
      setTimeout(() => this.showTimeUpModal(), 500);
    }
    
    this.showToast('✓ 设置已保存');
    this.updateTimerDisplay();
  },

  clearData() {
    if (!confirm('确定要清除所有学习数据吗？此操作不可恢复。')) return;
    
    Storage.clearAllData();
    this.showToast('✓ 数据已清除');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  },

  /**
   * Toast提示
   */
  showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }
};

// 全局函数（内联事件调用）
function goBack() { App.goBack(); }
function goHome() { App.goHome(); }
function navigateTo(page) { 
  // 手动触发导航
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.remove('hidden');
  
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => {
    n.classList.toggle('active', n.getAttribute('onclick').includes(`'${page}'`));
  });
  
  App.state.currentPage = page;
  const titles = { home: '学习小助手', subject: App.state.subject === 'english' ? '英语学习' : '语文学习', parent: '家长控制' };
  document.getElementById('page-title').textContent = titles[page] || '';
  document.getElementById('back-btn').style.display = page === 'home' ? 'none' : 'flex';
  
  if (page === 'home') App.updateHomePage();
  if (page === 'subject') App.showGradeSelect();
  if (page === 'parent') App.loadParentSettings();
  window.scrollTo(0, 0);
}
function selectSubject(subject) { App.selectSubject(subject); }
function openParentPanel() { App.openParentPanel(); }
function closeParentModal() { App.closeParentModal(); }
function verifyParent() { App.verifyParent(); }
function openSetPasswordModal() { App.openSetPasswordModal(); }
function closeSetPasswordModal() { App.closeSetPasswordModal(); }
function setParentPassword() { App.setParentPassword(); }
function saveParentSettings() { App.saveParentSettings(); }
function clearData() { App.clearData(); }
function showAnswer() { 
  // 简单提示
  App.showToast('提交后会显示正确答案哦~');
}
function submitAnswer() { App.submitAnswer(); }
function skipBreak() { App.skipBreak(); }
function closeTimeUpModal() { App.closeTimeUpModal(); }

// 启动应用
window.addEventListener('DOMContentLoaded', () => App.init());
