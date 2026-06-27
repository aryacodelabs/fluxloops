using Fluxor;

namespace SampleFluxorApp;

[FeatureState]
public record CounterState(int Count)
{
    public static CounterState CreateInitialState() => new(0);
}

public record IncrementCounterAction;
public record ResetCounterAction;

public static class CounterReducers
{
    [ReducerMethod]
    public static CounterState ReduceIncrement(CounterState state, IncrementCounterAction action) =>
        state with { Count = state.Count + 1 };

    [ReducerMethod]
    public static CounterState ReduceReset(CounterState state, ResetCounterAction action) =>
        state with { Count = 0 };
}

public class CounterEffects
{
    [EffectMethod]
    public Task HandleIncrement(IncrementCounterAction action, IDispatcher dispatcher)
    {
        if (action is not null)
        {
            dispatcher.Dispatch(new ResetCounterAction());
        }

        return Task.CompletedTask;
    }
}