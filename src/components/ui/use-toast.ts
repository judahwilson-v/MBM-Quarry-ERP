export const useToast = () => {
  return {
    toast: (props: any) => {
      console.log('Toast:', props);
      if (typeof window !== 'undefined' && props.title) {
        // Fallback since the actual toast component is missing
        // alert(props.title + (props.description ? '\n' + props.description : ''));
      }
    }
  };
};

export const toast = (props: any) => {
  console.log('Toast:', props);
};
