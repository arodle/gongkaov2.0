'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { useAppStore } from '@/lib/stores/appStore';
import type { BehaviorEventRecord, PracticeRecord, QuestionBankItem } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getPSColor } from '@/lib/utils/colors';
import { LocateFixed, Pause, Play, RotateCcw } from 'lucide-react';

export function RadarChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const { nodes } = useAppStore();

  const categoryScores = useMemo(() => {
    const categories = [
      { name: '言语理解', ids: ['k_1'] },
      { name: '数量关系', ids: ['k_2'] },
      { name: '判断推理', ids: ['k_3'] },
      { name: '资料分析', ids: ['k_4'] },
      { name: '常识判断', ids: ['k_5'] },
    ];

    return categories.map(cat => {
      const categoryNodes = nodes.filter(n =>
        cat.ids.some(id => n.id === id || n.parent_id === id)
      );

      if (categoryNodes.length === 0) {
        return { name: cat.name, value: 50 };
      }

      const avgPS = categoryNodes.reduce((sum, n) => sum + n.ps_score, 0) / categoryNodes.length;
      return { name: cat.name, value: Math.round(avgPS) };
    });
  }, [nodes]);

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
      },
      radar: {
        indicator: categoryScores.map(s => ({
          name: s.name,
          max: 200,
        })),
        shape: 'polygon',
        splitNumber: 4,
        axisName: {
          color: '#64748b',
          fontSize: 12,
        },
        splitLine: {
          lineStyle: {
            color: '#e2e8f0',
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1'].map(c => `${c}40`),
          },
        },
        axisLine: {
          lineStyle: {
            color: '#e2e8f0',
          },
        },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: categoryScores.map(s => s.value),
              name: '能力矩阵',
              symbol: 'circle',
              symbolSize: 8,
              lineStyle: {
                width: 3,
                color: '#A49AFF',
              },
              areaStyle: {
                color: new echarts.graphic.RadialGradient(0.5, 0.5, 1, [
                  { offset: 0, color: '#A49AFF80' },
                  { offset: 1, color: '#B7E3FF33' },
                ]),
              },
              itemStyle: {
                color: '#A49AFF',
                borderColor: '#fff',
                borderWidth: 2,
              },
            },
          ],
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [categoryScores]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>能力矩阵雷达图</span>
          <Badge variant="outline">综合能力评估</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="w-full h-[350px]" />
      </CardContent>
    </Card>
  );
}

export function PSTrendChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const { psHistory, nodes } = useAppStore();
  const [selectedNode, setSelectedNode] = useState<string>('all');

  const weakNodes = useMemo(() => {
    return nodes.filter(n => n.ps_score < 80);
  }, [nodes]);

  const chartData = useMemo(() => {
    if (selectedNode === 'all') {
      const historyByDate = new Map<string, { total: number; count: number }>();

      psHistory.forEach(record => {
        const date = record.recorded_at.split('T')[0];
        const existing = historyByDate.get(date) || { total: 0, count: 0 };
        historyByDate.set(date, {
          total: existing.total + record.ps_score,
          count: existing.count + 1,
        });
      });

      const sortedDates = Array.from(historyByDate.keys()).sort();
      return {
        dates: sortedDates,
        values: sortedDates.map(date => {
          const data = historyByDate.get(date)!;
          return Math.round(data.total / data.count);
        }),
      };
    }

    const nodeHistory = psHistory
      .filter(r => r.node_id === selectedNode)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

    return {
      dates: nodeHistory.map(r => r.recorded_at.split('T')[0]),
      values: nodeHistory.map(r => r.ps_score),
    };
  }, [psHistory, selectedNode]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<{ axisValue: string; value: number }>) => {
          const data = params[0];
          return `${data.axisValue}<br/>PS: ${data.value}`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: chartData.dates,
        axisLine: {
          lineStyle: {
            color: '#e2e8f0',
          },
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 200,
        splitLine: {
          lineStyle: {
            color: '#f1f5f9',
          },
        },
        axisLine: {
          show: false,
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
        },
      },
      series: [
        {
          name: 'PS 分数',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          sampling: 'average',
          itemStyle: {
            color: '#A49AFF',
          },
          lineStyle: {
            width: 3,
            color: '#A49AFF',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#A49AFF40' },
              { offset: 1, color: '#B7E3FF10' },
            ]),
          },
          data: chartData.values,
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartData]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>PS 掌握度趋势</span>
          <Select value={selectedNode} onValueChange={setSelectedNode}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="选择知识点" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平均</SelectItem>
              {weakNodes.map(node => (
                <SelectItem key={node.id} value={node.id}>
                  {node.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="w-full h-[300px]" />
      </CardContent>
    </Card>
  );
}

export function HoneycombMap() {
  const { nodes } = useAppStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const hexSize = 30;
    const hexHeight = hexSize * Math.sqrt(3);
    const hexWidth = hexSize * 2;
    const cols = Math.ceil(rect.width / (hexWidth * 0.75)) + 1;
    const rows = Math.ceil(rect.height / hexHeight) + 1;

    let index = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * hexWidth * 0.75;
        const y = row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0);

        const node = nodes[index % nodes.length];
        const color = node ? getPSColor(node.ps_score) : getPSColor(50);

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = x + hexSize * Math.cos(angle);
          const hy = y + hexSize * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        ctx.fillStyle = color.background + '80';
        ctx.fill();
        ctx.strokeStyle = color.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (node && node.name.length > 0) {
          ctx.fillStyle = '#64748b';
          ctx.font = '8px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const displayName = node.name.length > 4 ? node.name.slice(0, 4) + '..' : node.name;
          ctx.fillText(displayName, x, y);
        }

        index++;
      }
    }
  }, [nodes]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>知识扫雷全景图</span>
          <Badge variant="outline">游戏化视图</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-[400px] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
        </div>
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#DC2626]" />
            <span className="text-xs text-muted-foreground">薄弱</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#EA580C]" />
            <span className="text-xs text-muted-foreground">需加强</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#CA8A04]" />
            <span className="text-xs text-muted-foreground">学习中</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#0891B2]" />
            <span className="text-xs text-muted-foreground">熟练</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ReplayRecordItem {
  record: PracticeRecord;
  question: QuestionBankItem;
}

interface ReplayTimelineItem {
  event: BehaviorEventRecord;
  elapsedMs: number;
  label: string;
  detail: string;
}

const replayEventTypes = new Set(['highlight', 'circle', 'strike', 'answer_select', 'answer_change', 'note']);

function getEventKey(event: BehaviorEventRecord, index = 0) {
  return event.id || `${event.eventType}_${event.startTime}_${index}`;
}

function getReplayElapsedMs(event: BehaviorEventRecord, baseTime: number) {
  const elapsed = event.metadata?.elapsedMs;
  if (typeof elapsed === 'number' && Number.isFinite(elapsed)) return Math.max(0, elapsed);

  const eventTime = new Date(event.startTime).getTime();
  if (!Number.isFinite(eventTime) || !Number.isFinite(baseTime)) return 0;
  return Math.max(0, eventTime - baseTime);
}

function getReplayOptionLabel(event: BehaviorEventRecord) {
  if (typeof event.metadata?.optionLabel === 'string') return event.metadata.optionLabel;
  if (typeof event.metadata?.selectedAnswer === 'string') return event.metadata.selectedAnswer;
  if (typeof event.metadata?.to === 'string') return event.metadata.to;
  return event.target.startsWith('option:') ? event.target.replace('option:', '') : '';
}

function getReplayEventText(event: BehaviorEventRecord) {
  const selectedText = typeof event.metadata?.selectedText === 'string' ? event.metadata.selectedText : '';
  const optionLabel = getReplayOptionLabel(event);

  if (event.eventType === 'highlight') return { label: `高亮“${selectedText || '题干文字'}”`, detail: selectedText };
  if (event.eventType === 'circle') return { label: `圈选“${selectedText || '题干文字'}”`, detail: selectedText };
  if (event.eventType === 'strike') {
    return {
      label: `${event.metadata?.active === false ? '取消划掉' : '划掉'}${optionLabel}`,
      detail: typeof event.metadata?.optionText === 'string' ? event.metadata.optionText : '',
    };
  }
  if (event.eventType === 'answer_select') return { label: `选择${optionLabel}`, detail: '' };
  if (event.eventType === 'answer_change') {
    return {
      label: `修改为${optionLabel}`,
      detail: `从 ${event.metadata?.from || '-'} 到 ${event.metadata?.to || optionLabel || '-'}`,
    };
  }
  if (event.eventType === 'note') {
    return { label: '添加备注', detail: typeof event.metadata?.note === 'string' ? event.metadata.note : '' };
  }
  return { label: event.eventType, detail: '' };
}

function formatRecordTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PracticeReplayRecords() {
  const {
    practiceRecords,
    questionBank,
    behaviorEvents,
    loadBehaviorEventsForQuestion,
  } = useAppStore();
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const noteRef = useRef<HTMLDivElement | null>(null);

  const records = useMemo<ReplayRecordItem[]>(() => {
    return practiceRecords
      .map(record => {
        const question = questionBank.find(item => item.id === record.question_id);
        return question ? { record, question } : null;
      })
      .filter((item): item is ReplayRecordItem => Boolean(item))
      .sort((a, b) => new Date(b.record.updated_at).getTime() - new Date(a.record.updated_at).getTime());
  }, [practiceRecords, questionBank]);

  useEffect(() => {
    if (records.length === 0) {
      setSelectedRecordId(null);
      return;
    }
    if (!selectedRecordId || !records.some(item => item.record.id === selectedRecordId)) {
      setSelectedRecordId(records[0].record.id);
    }
  }, [records, selectedRecordId]);

  const selectedItem = useMemo(() => {
    return records.find(item => item.record.id === selectedRecordId) || records[0] || null;
  }, [records, selectedRecordId]);
  const selectedQuestionId = selectedItem?.question.id;

  useEffect(() => {
    if (!selectedQuestionId) return;
    void loadBehaviorEventsForQuestion(selectedQuestionId);
    setActiveEventId(null);
    setIsPlaying(false);
    setReplayIndex(0);
  }, [loadBehaviorEventsForQuestion, selectedQuestionId]);

  const replayTimeline = useMemo<ReplayTimelineItem[]>(() => {
    if (!selectedItem) return [];

    const events = behaviorEvents.filter(event => (
      event.questionId === selectedItem.question.id && replayEventTypes.has(event.eventType)
    ));
    const baseTime = events.reduce((min, event) => {
      const time = new Date(event.startTime).getTime();
      return Number.isFinite(time) ? Math.min(min, time) : min;
    }, Number.POSITIVE_INFINITY);

    return events
      .map(event => {
        const { label, detail } = getReplayEventText(event);
        return { event, label, detail, elapsedMs: getReplayElapsedMs(event, baseTime) };
      })
      .sort((a, b) => {
        if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
        return a.event.startTime.localeCompare(b.event.startTime);
      });
  }, [behaviorEvents, selectedItem]);

  const focusReplayEvent = React.useCallback((event: BehaviorEventRecord, index: number) => {
    const eventId = getEventKey(event, index);
    setActiveEventId(eventId);
    setReplayIndex(index);

    if (event.eventType === 'highlight' || event.eventType === 'circle') {
      questionTextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (event.eventType === 'note') {
      noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const optionLabel = getReplayOptionLabel(event);
      optionRefs.current[optionLabel]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    window.setTimeout(() => {
      setActiveEventId(current => (current === eventId ? null : current));
    }, 1800);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    if (replayTimeline.length === 0 || replayIndex >= replayTimeline.length) {
      setIsPlaying(false);
      return;
    }

    const current = replayTimeline[replayIndex];
    focusReplayEvent(current.event, replayIndex);
    const next = replayTimeline[replayIndex + 1];
    const rawDelay = next ? next.elapsedMs - current.elapsedMs : 900;
    const delay = Math.max(280, Math.min(2400, rawDelay / replaySpeed));
    const timer = window.setTimeout(() => {
      setReplayIndex(index => index + 1);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [focusReplayEvent, isPlaying, replayIndex, replaySpeed, replayTimeline]);

  const noteEvents = replayTimeline.filter(item => item.event.eventType === 'note' && item.detail);
  const activeEvent = activeEventId
    ? replayTimeline.find((item, index) => getEventKey(item.event, index) === activeEventId)?.event
    : null;
  const activeOption = activeEvent ? getReplayOptionLabel(activeEvent) : '';
  const activeQuestionText = activeEvent?.eventType === 'highlight' || activeEvent?.eventType === 'circle';
  const activeNote = activeEvent?.eventType === 'note';

  if (records.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">做题记录</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
            暂无做题记录。完成练习后，这里会按题展示行为时间轴和复盘回放。
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2 sm:pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base sm:text-lg">
          <span>做题记录</span>
          <Badge variant="outline">{records.length} 条记录</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1 lg:max-h-[560px]">
            {records.map(item => (
              <button
                key={item.record.id}
                type="button"
                onClick={() => setSelectedRecordId(item.record.id)}
                className={[
                  'w-full rounded-lg border p-3 text-left transition-colors hover:bg-slate-50',
                  selectedItem?.record.id === item.record.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">{formatRecordTime(item.record.updated_at)}</span>
                  <Badge variant={item.record.is_correct ? 'secondary' : 'destructive'}>
                    {item.record.is_correct ? '正确' : '错误'}
                  </Badge>
                </div>
                <div className="line-clamp-2 text-sm font-medium text-slate-800">{item.question.content}</div>
                <div className="mt-1 text-xs text-slate-500">
                  用时 {Math.round(item.record.answer_time / 1000)} 秒
                </div>
              </button>
            ))}
          </div>

          {selectedItem && (
            <div className="min-w-0 space-y-4">
              <div
                ref={questionTextRef}
                className={[
                  'rounded-xl border bg-white p-4 text-sm leading-relaxed text-slate-800 transition-all sm:text-base',
                  activeQuestionText ? 'ring-2 ring-blue-300 ring-offset-2' : '',
                ].join(' ')}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={selectedItem.record.is_correct ? 'secondary' : 'destructive'}>
                    {selectedItem.record.is_correct ? '回答正确' : '回答错误'}
                  </Badge>
                  <span className="text-xs text-slate-500">{selectedItem.question.knowledgePath || selectedItem.question.linkedAngleName}</span>
                </div>
                <div className="whitespace-pre-line">{selectedItem.question.content}</div>
              </div>

              <div className="grid gap-2">
                {selectedItem.question.options.map(option => (
                  <div
                    key={option.label}
                    ref={(element) => {
                      optionRefs.current[option.label] = element;
                    }}
                    className={[
                      'flex gap-3 rounded-xl border bg-white p-3 text-sm transition-all',
                      option.label === selectedItem.question.correctAnswer ? 'border-[#b7e3ff] bg-[#b7e3ff]/35' : 'border-slate-200',
                      activeOption === option.label ? 'ring-2 ring-blue-300 ring-offset-2' : '',
                    ].join(' ')}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white text-xs font-semibold">
                      {option.label}
                    </span>
                    <span className="min-w-0 flex-1">{option.text}</span>
                  </div>
                ))}
              </div>

              <div
                ref={noteRef}
                className={[
                  'rounded-xl border bg-white p-3 transition-all',
                  activeNote ? 'ring-2 ring-blue-300 ring-offset-2' : '',
                ].join(' ')}
              >
                <div className="mb-2 text-sm font-medium">备注</div>
                {noteEvents.length === 0 ? (
                  <div className="text-xs text-slate-500">这道题没有备注事件。</div>
                ) : (
                  <div className="space-y-1">
                    {noteEvents.map((item, index) => (
                      <div key={getEventKey(item.event, index)} className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        {item.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-white p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LocateFixed className="h-4 w-4 text-blue-600" />
                    <div>
                      <div className="text-sm font-medium">行为时间轴</div>
                      <div className="text-xs text-slate-500">{replayTimeline.length} 个行为事件</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={replaySpeed}
                      onChange={(event) => setReplaySpeed(Number(event.target.value))}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      aria-label="回放速度"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                      <option value={4}>4x</option>
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (replayIndex >= replayTimeline.length) setReplayIndex(0);
                        setIsPlaying(value => !value);
                      }}
                      disabled={replayTimeline.length === 0}
                    >
                      {isPlaying ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
                      {isPlaying ? '暂停' : '播放'}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setIsPlaying(false);
                        setReplayIndex(0);
                        setActiveEventId(null);
                      }}
                      disabled={replayTimeline.length === 0}
                      aria-label="重置回放"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {replayTimeline.length === 0 ? (
                  <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                    这道题暂无行为事件。做题时高亮、圈选、划掉选项、修改答案或添加备注后会自动进入这里。
                  </div>
                ) : (
                  <div className="relative max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    <div className="absolute bottom-2 left-[4.35rem] top-2 w-px bg-slate-200" />
                    {replayTimeline.map((item, index) => {
                      const itemKey = getEventKey(item.event, index);
                      const isActive = itemKey === activeEventId || index === replayIndex - 1;
                      return (
                        <button
                          key={itemKey}
                          type="button"
                          onClick={() => focusReplayEvent(item.event, index)}
                          className={[
                            'relative grid w-full grid-cols-[4rem_1rem_1fr] items-start gap-2 rounded-lg p-2 text-left transition-all hover:bg-slate-50',
                            isActive ? 'bg-blue-50 ring-1 ring-blue-200' : '',
                          ].join(' ')}
                        >
                          <span className="text-right text-xs font-medium text-slate-500">第{Math.round(item.elapsedMs / 1000)}秒</span>
                          <span className={['mt-1 h-2.5 w-2.5 rounded-full border bg-white', isActive ? 'border-blue-500 bg-blue-500' : 'border-slate-300'].join(' ')} />
                          <span>
                            <span className="block text-sm font-medium text-slate-800">{item.label}</span>
                            {item.detail && <span className="mt-0.5 block line-clamp-1 text-xs text-slate-500">{item.detail}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportDashboard() {
  const { nodes, questionBank, getWeakNodes } = useAppStore();
  const weakNodes = getWeakNodes();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="px-4 pb-2 pt-3 sm:px-6 sm:pt-6">
        <h2 className="text-base font-semibold tracking-tight sm:text-xl md:text-2xl">数据报告</h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          全面了解你的学习进度和能力分布
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b px-4 py-2 sm:gap-3 sm:px-6">
        <div className="rounded-md bg-blue-50 p-2 text-center dark:bg-blue-900/30 sm:p-3">
          <div className="text-base sm:text-xl font-bold text-blue-600 dark:text-blue-400">
            {nodes.length}
          </div>
          <div className="text-[10px] sm:text-xs text-blue-600/70">知识点</div>
        </div>
        <div className="rounded-md bg-[#b7e3ff]/40 p-2 text-center dark:bg-violet-900/30 sm:p-3">
          <div className="text-base font-bold text-[#5e5394] dark:text-violet-200 sm:text-xl">
            {questionBank.length}
          </div>
          <div className="text-[10px] text-[#5e5394]/70 sm:text-xs">题库</div>
        </div>
        <div className="rounded-md bg-red-50 p-2 text-center dark:bg-red-900/30 sm:p-3">
          <div className="text-base sm:text-xl font-bold text-red-600 dark:text-red-400">
            {weakNodes.length}
          </div>
          <div className="text-[10px] sm:text-xs text-red-600/70">薄弱点</div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-3 pt-2 sm:space-y-6 sm:p-6 sm:pt-2">
          <Tabs defaultValue="radar" className="space-y-4 sm:space-y-6">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
              <TabsTrigger value="radar" className="h-8 flex-1 text-xs sm:text-sm">能力雷达</TabsTrigger>
              <TabsTrigger value="trend" className="h-8 flex-1 text-xs sm:text-sm">PS 趋势</TabsTrigger>
              <TabsTrigger value="map" className="h-8 flex-1 text-xs sm:text-sm">全景图</TabsTrigger>
              <TabsTrigger value="records" className="h-8 flex-1 text-xs sm:text-sm">做题记录</TabsTrigger>
            </TabsList>

            <TabsContent value="radar" className="space-y-4 sm:space-y-6">
              <RadarChart />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">综合能力评估</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    基于你的学习数据，系统评估了你的综合能力。建议重点关注薄弱知识点的练习，通过靶向练习提升整体掌握度。
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                    {[
                      { name: '言语理解', color: 'bg-blue-500' },
                      { name: '数量关系', color: 'bg-[#B7E3FF]' },
                      { name: '判断推理', color: 'bg-purple-500' },
                      { name: '资料分析', color: 'bg-orange-500' },
                      { name: '常识判断', color: 'bg-pink-500' },
                    ].map((item, idx) => (
                      <div key={idx} className="text-center p-2 rounded-lg bg-muted">
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 mx-auto rounded-full ${item.color} mb-1`} />
                        <div className="text-[10px] sm:text-xs">{item.name}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trend" className="space-y-4 sm:space-y-6">
              <PSTrendChart />
            </TabsContent>

            <TabsContent value="map" className="space-y-4 sm:space-y-6">
              <HoneycombMap />
            </TabsContent>

            <TabsContent value="records" className="space-y-4 sm:space-y-6">
              <PracticeReplayRecords />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
